import { Server as SocketIOServer, Socket } from 'socket.io';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { Call } from '../models/Call';
import { sendCallPushNotification } from '../services/notificationService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

interface ActiveGroupCallMemory {
  callId: string;
  conversationId: string;
  callType: 'voice' | 'video';
  initiatorId: string;
  activeParticipants: Set<string>;
  startedAt: Date;
}

// In-Memory map for 0ms latency multi-party WebRTC signaling
const activeGroupCallsMap = new Map<string, ActiveGroupCallMemory>();

function formatDurationText(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function registerGroupCallHandlers(io: SocketIOServer, socket: AuthenticatedSocket): void {
  const userId = socket.userId;
  if (!userId) return;

  // 1. Initiate Group Call
  socket.on(
    'group_call:initiate',
    async (data: { conversationId: string; callType?: 'voice' | 'video' }) => {
      try {
        const { conversationId, callType = 'voice' } = data;
        if (!conversationId) {
          socket.emit('group_call:error', { message: 'Missing conversationId' });
          return;
        }

        const group = await Conversation.findOne({ _id: conversationId, isGroup: true })
          .populate('groupMeta.members.user', '_id displayName username avatarUrl fcmTokens');

        if (!group || !group.groupMeta) {
          socket.emit('group_call:error', { message: 'Group not found' });
          return;
        }

        // Verify user is an accepted member of this group
        const memberEntry = group.groupMeta.members.find(
          (m: any) => m.user?._id?.toString() === userId || m.user?.toString() === userId
        );
        if (!memberEntry || memberEntry.status !== 'accepted') {
          socket.emit('group_call:error', { message: 'You must be an accepted member to start a call' });
          return;
        }

        // Check if there is already an active call in this group
        for (const [existingCallId, activeCall] of activeGroupCallsMap.entries()) {
          if (activeCall.conversationId === conversationId && activeCall.activeParticipants.size > 0) {
            socket.emit('group_call:already_active', {
              callId: existingCallId,
              callType: activeCall.callType,
              activeParticipants: Array.from(activeCall.activeParticipants),
            });
            return;
          }
        }

        const callId = `grpcall_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const startedAt = new Date();

        // Create DB Call record
        const newCall = new Call({
          callId,
          callerId: userId,
          conversationId,
          isGroup: true,
          callType,
          status: 'connected',
          startedAt,
          activeParticipants: [userId],
          participantsHistory: [{ userId, joinedAt: startedAt }],
        });
        await newCall.save();

        // Store in memory
        const memoryCall: ActiveGroupCallMemory = {
          callId,
          conversationId,
          callType,
          initiatorId: userId,
          activeParticipants: new Set([userId]),
          startedAt,
        };
        activeGroupCallsMap.set(callId, memoryCall);

        socket.join(`group_call:${callId}`);
        socket.join(`conv:${conversationId}`);

        const initiatorUser = await User.findById(userId).select('_id displayName avatarUrl username');

        // Confirm to initiator
        socket.emit('group_call:initiated', {
          callId,
          conversationId,
          callType,
          activeParticipants: [
            {
              _id: initiatorUser?._id || userId,
              displayName: initiatorUser?.displayName || 'Host',
              avatarUrl: initiatorUser?.avatarUrl || '',
              username: initiatorUser?.username || '',
            },
          ],
        });

        // Broadcast active call banner to all conversation listeners
        io.to(`conv:${conversationId}`).emit('group_call:banner_update', {
          conversationId,
          callId,
          callType,
          isActive: true,
          participantCount: 1,
          startedAt,
        });

        // Broadcast incoming call event & send push notifications to other accepted members
        const acceptedMembers = group.groupMeta.members.filter(
          (m: any) =>
            m.status === 'accepted' &&
            (m.user?._id?.toString() || m.user?.toString()) !== userId
        );

        acceptedMembers.forEach((m: any) => {
          const targetUserId = m.user?._id?.toString() || m.user?.toString();
          if (targetUserId) {
            io.to(`user:${targetUserId}`).emit('group_call:incoming', {
              callId,
              conversationId,
              callType,
              groupName: group.groupMeta?.name || 'Group Chat',
              groupAvatar: group.groupMeta?.avatarUrl || '',
              caller: {
                _id: initiatorUser?._id,
                displayName: initiatorUser?.displayName || 'A group member',
                avatar: initiatorUser?.avatarUrl || '',
                username: initiatorUser?.username || '',
              },
            });

            // Send high priority push notification
            sendCallPushNotification({
              recipientId: targetUserId,
              callerId: String(userId),
              callerName: `${initiatorUser?.displayName || 'Someone'} in ${group.groupMeta?.name || 'Group'}`,
              callerAvatar: group.groupMeta?.avatarUrl || initiatorUser?.avatarUrl || '',
              callId,
              conversationId,
              callType,
            }).catch(() => {});
          }
        });

        console.log(`[GroupCall] Started group call ${callId} in conversation ${conversationId} by ${initiatorUser?.displayName}`);
      } catch (err: any) {
        console.error('[GroupCall] initiate error:', err);
        socket.emit('group_call:error', { message: err?.message || 'Failed to initiate group call' });
      }
    }
  );

  // 2. Join Active Group Call
  socket.on('group_call:join', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) {
        socket.emit('group_call:error', { message: 'Missing callId' });
        return;
      }

      let mem = activeGroupCallsMap.get(callId);
      if (!mem) {
        const dbCall = await Call.findOne({ callId, isGroup: true, status: { $ne: 'ended' } });
        if (dbCall) {
          mem = {
            callId,
            conversationId: dbCall.conversationId.toString(),
            callType: dbCall.callType || 'voice',
            initiatorId: dbCall.callerId.toString(),
            activeParticipants: new Set(dbCall.activeParticipants.map((p) => p.toString())),
            startedAt: dbCall.startedAt || new Date(),
          };
          activeGroupCallsMap.set(callId, mem);
        }
      }

      if (!mem) {
        socket.emit('group_call:error', { message: 'Group call has ended or does not exist' });
        return;
      }

      if (mem.activeParticipants.size >= 10) {
        socket.emit('group_call:error', { message: 'Group call is full (max 10 participants)' });
        return;
      }

      // Add user to active call
      mem.activeParticipants.add(userId);
      socket.join(`group_call:${callId}`);
      socket.join(`conv:${mem.conversationId}`);

      // Update Call document
      await Call.updateOne(
        { callId },
        {
          $addToSet: { activeParticipants: userId },
          $push: { participantsHistory: { userId, joinedAt: new Date() } },
        }
      );

      // Get user profile
      const userProfile = await User.findById(userId).select('_id displayName avatarUrl username');

      // Fetch profiles of all active participants
      const activeIds = Array.from(mem.activeParticipants);
      const allActiveUsers = await User.find({ _id: { $in: activeIds } }).select('_id displayName avatarUrl username');

      // Respond to the joining user with the list of other active peers
      const otherPeers = allActiveUsers.filter((u) => u._id.toString() !== userId);
      socket.emit('group_call:joined', {
        callId,
        conversationId: mem.conversationId,
        callType: mem.callType,
        existingParticipants: otherPeers,
        allParticipants: allActiveUsers,
      });

      // Broadcast to other participants in the call that a new peer joined
      socket.to(`group_call:${callId}`).emit('group_call:participant_joined', {
        callId,
        user: {
          _id: userProfile?._id || userId,
          displayName: userProfile?.displayName || 'Participant',
          avatarUrl: userProfile?.avatarUrl || '',
          username: userProfile?.username || '',
        },
        activeParticipantCount: mem.activeParticipants.size,
      });

      // Update in-chat banner
      io.to(`conv:${mem.conversationId}`).emit('group_call:banner_update', {
        conversationId: mem.conversationId,
        callId,
        callType: mem.callType,
        isActive: true,
        participantCount: mem.activeParticipants.size,
        startedAt: mem.startedAt,
      });

      console.log(`[GroupCall] User ${userProfile?.displayName} joined call ${callId} (Total: ${mem.activeParticipants.size})`);
    } catch (err: any) {
      console.error('[GroupCall] join error:', err);
      socket.emit('group_call:error', { message: err?.message || 'Failed to join group call' });
    }
  });

  // 3. Fast WebRTC Mesh Peer-to-Peer Signaling Relay
  socket.on(
    'group_call:signal',
    (data: { callId: string; targetUserId: string; signal: any }) => {
      try {
        const { callId, targetUserId, signal } = data;
        if (!callId || !targetUserId || !signal) return;

        // Directly forward to the targeted peer in 0ms with zero DB overhead
        io.to(`user:${targetUserId}`).emit('group_call:signal', {
          callId,
          senderId: userId,
          signal,
        });
      } catch (err) {
        console.error('[GroupCall] signal relay error:', err);
      }
    }
  );

  // 4. Leave Group Call
  socket.on('group_call:leave', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) return;

      const mem = activeGroupCallsMap.get(callId);
      if (!mem) return;

      mem.activeParticipants.delete(userId);
      socket.leave(`group_call:${callId}`);

      // Update leftAt in DB
      await Call.updateOne(
        { callId },
        {
          $pull: { activeParticipants: userId },
          $set: { 'participantsHistory.$[elem].leftAt': new Date() },
        },
        { arrayFilters: [{ 'elem.userId': userId, 'elem.leftAt': { $exists: false } }] }
      );

      // Inform remaining participants
      socket.to(`group_call:${callId}`).emit('group_call:participant_left', {
        callId,
        userId,
        activeParticipantCount: mem.activeParticipants.size,
      });

      // Acknowledge to leaving user
      socket.emit('group_call:left', { callId });

      // If call is now empty, end the call
      if (mem.activeParticipants.size === 0) {
        activeGroupCallsMap.delete(callId);

        const endedAt = new Date();
        const durationSecs = Math.max(
          0,
          Math.round((endedAt.getTime() - new Date(mem.startedAt).getTime()) / 1000)
        );

        await Call.updateOne(
          { callId },
          {
            $set: {
              status: 'ended',
              endedAt,
              duration: durationSecs,
              activeParticipants: [],
            },
          }
        );

        const durText = formatDurationText(durationSecs);
        const isVideo = mem.callType === 'video';

        // Record in conversation as a completed group call message
        const callMsg = new Message({
          conversationId: mem.conversationId,
          senderId: mem.initiatorId,
          text: isVideo ? `📹 Group video call (${durText})` : `📞 Group voice call (${durText})`,
          type: 'call',
          status: 'delivered',
          clientMessageId: `grpcall_msg_${callId}`,
          callDetails: {
            callId,
            isGroup: true,
            callType: mem.callType,
            status: 'completed',
            duration: durationSecs,
            startedAt: mem.startedAt,
            endedAt,
          },
        });
        await callMsg.save();

        io.to(`conv:${mem.conversationId}`).emit('message:new', callMsg);
        io.to(`conv:${mem.conversationId}`).emit('group_call:ended', { callId, conversationId: mem.conversationId });
        io.to(`conv:${mem.conversationId}`).emit('group_call:banner_update', {
          conversationId: mem.conversationId,
          isActive: false,
        });

        console.log(`[GroupCall] Call ${callId} ended. Total duration: ${durText}`);
      } else {
        // Update banner with remaining count
        io.to(`conv:${mem.conversationId}`).emit('group_call:banner_update', {
          conversationId: mem.conversationId,
          callId,
          callType: mem.callType,
          isActive: true,
          participantCount: mem.activeParticipants.size,
          startedAt: mem.startedAt,
        });
      }
    } catch (err) {
      console.error('[GroupCall] leave error:', err);
    }
  });

  // 5. Query active call state in a conversation
  socket.on('group_call:get_active', (data: { conversationId: string }) => {
    try {
      const { conversationId } = data;
      if (!conversationId) return;

      for (const [callId, mem] of activeGroupCallsMap.entries()) {
        if (mem.conversationId === conversationId && mem.activeParticipants.size > 0) {
          socket.emit('group_call:active_state', {
            conversationId,
            callId,
            callType: mem.callType,
            isActive: true,
            participantCount: mem.activeParticipants.size,
            startedAt: mem.startedAt,
          });
          return;
        }
      }

      socket.emit('group_call:active_state', {
        conversationId,
        isActive: false,
      });
    } catch (err) {
      console.error('[GroupCall] get_active error:', err);
    }
  });

  // 6. Socket Disconnect Auto-Cleanup for Group Calls
  socket.on('disconnect', async () => {
    try {
      for (const [callId, mem] of activeGroupCallsMap.entries()) {
        if (mem.activeParticipants.has(userId)) {
          mem.activeParticipants.delete(userId);

          await Call.updateOne(
            { callId },
            {
              $pull: { activeParticipants: userId },
              $set: { 'participantsHistory.$[elem].leftAt': new Date() },
            },
            { arrayFilters: [{ 'elem.userId': userId, 'elem.leftAt': { $exists: false } }] }
          );

          socket.to(`group_call:${callId}`).emit('group_call:participant_left', {
            callId,
            userId,
            activeParticipantCount: mem.activeParticipants.size,
          });

          if (mem.activeParticipants.size === 0) {
            activeGroupCallsMap.delete(callId);
            const endedAt = new Date();
            const durationSecs = Math.max(
              0,
              Math.round((endedAt.getTime() - new Date(mem.startedAt).getTime()) / 1000)
            );

            await Call.updateOne(
              { callId },
              {
                $set: {
                  status: 'ended',
                  endedAt,
                  duration: durationSecs,
                  activeParticipants: [],
                },
              }
            );

            const durText = formatDurationText(durationSecs);
            const isVideo = mem.callType === 'video';

            const callMsg = new Message({
              conversationId: mem.conversationId,
              senderId: mem.initiatorId,
              text: isVideo ? `📹 Group video call (${durText})` : `📞 Group voice call (${durText})`,
              type: 'call',
              status: 'delivered',
              clientMessageId: `grpcall_msg_${callId}`,
              callDetails: {
                callId,
                isGroup: true,
                callType: mem.callType,
                status: 'completed',
                duration: durationSecs,
                startedAt: mem.startedAt,
                endedAt,
              },
            });
            await callMsg.save();

            io.to(`conv:${mem.conversationId}`).emit('message:new', callMsg);
            io.to(`conv:${mem.conversationId}`).emit('group_call:ended', { callId, conversationId: mem.conversationId });
            io.to(`conv:${mem.conversationId}`).emit('group_call:banner_update', {
              conversationId: mem.conversationId,
              isActive: false,
            });
          } else {
            io.to(`conv:${mem.conversationId}`).emit('group_call:banner_update', {
              conversationId: mem.conversationId,
              callId,
              callType: mem.callType,
              isActive: true,
              participantCount: mem.activeParticipants.size,
              startedAt: mem.startedAt,
            });
          }
        }
      }
    } catch (err) {
      // Ignore during socket teardown
    }
  });
}