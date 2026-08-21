import { Server as SocketIOServer, Socket } from 'socket.io';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { Call, ICall } from '../models/Call';
import { sendCallPushNotification, sendCallCancelledPushNotification } from '../services/notificationService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

interface ActiveCallMemory {
  callId: string;
  callerId: string;
  receiverId: string;
  conversationId: string;
}

// In-Memory map for 0ms latency WebRTC signaling & ICE candidate relay
const activeCallsMap = new Map<string, ActiveCallMemory>();
// Active timeouts map: callId -> NodeJS.Timeout
const callTimeouts = new Map<string, NodeJS.Timeout>();

function formatDurationText(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function registerCallHandlers(io: SocketIOServer, socket: AuthenticatedSocket): void {
  const userId = socket.userId;
  if (!userId) return;

  // Check if there is an active incoming call for this user upon connecting
  (async () => {
    try {
      const fortyFiveSecsAgo = new Date(Date.now() - 45000);
      const pendingCall = await Call.findOne({
        receiverId: userId,
        status: { $in: ['calling', 'ringing'] },
        startedAt: { $gte: fortyFiveSecsAgo },
      }).populate('callerId', 'displayName avatarUrl username');

      if (pendingCall && pendingCall.callerId) {
        const caller: any = pendingCall.callerId;
        console.log(`[Call] Emitting pending incoming call ${pendingCall.callId} to reconnected user ${userId}`);
        socket.emit('call:incoming', {
          callId: pendingCall.callId,
          caller: {
            _id: caller._id,
            displayName: caller.displayName || 'User',
            avatar: caller.avatarUrl || '',
            username: caller.username || '',
          },
          conversationId: pendingCall.conversationId,
          callType: pendingCall.callType,
        });
      }
    } catch (e) {
      console.warn('[Call] Error checking pending incoming calls on socket connect:', e);
    }
  })();

  // 1. Initiate Voice Call
  socket.on(
    'call:initiate',
    async (data: { conversationId: string; receiverId: string; callType?: 'voice' | 'video' }) => {
      try {
        const { conversationId, receiverId, callType = 'voice' } = data;
        if (!conversationId || !receiverId) {
          socket.emit('call:error', { message: 'Missing conversationId or receiverId' });
          return;
        }

        if (receiverId === userId) {
          socket.emit('call:error', { message: 'Cannot call yourself' });
          return;
        }

        // Validate conversation & participants
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          socket.emit('call:error', { message: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some(
          (p) => p.toString() === userId || p.toString() === receiverId
        );
        if (!isParticipant) {
          socket.emit('call:error', { message: 'Unauthorized call attempt' });
          return;
        }

        // Auto-clean any stale hanging calls for caller or receiver older than 30s
        const thirtySecsAgo = new Date(Date.now() - 30000);
        await Call.updateMany(
          {
            $or: [
              { callerId: userId },
              { receiverId: userId },
              { callerId: receiverId },
              { receiverId: receiverId },
            ],
            status: { $in: ['calling', 'ringing', 'accepted'] },
            updatedAt: { $lt: thirtySecsAgo },
          },
          { $set: { status: 'ended', endedAt: new Date() } }
        );

        // Also clean any previous hanging call specifically between these two users
        await Call.updateMany(
          {
            $or: [
              { callerId: userId, receiverId: receiverId },
              { callerId: receiverId, receiverId: userId },
            ],
            status: { $in: ['calling', 'ringing', 'accepted', 'connected'] },
          },
          { $set: { status: 'ended', endedAt: new Date() } }
        );

        // Check if receiver is currently genuinely in an active call with someone else
        const activeCallWithOther = await Call.findOne({
          $or: [{ callerId: receiverId }, { receiverId: receiverId }],
          callerId: { $ne: userId },
          receiverId: { $ne: userId },
          status: 'connected',
          updatedAt: { $gte: new Date(Date.now() - 120000) },
        });

        if (activeCallWithOther) {
          const otherUser = await User.findById(receiverId).select('displayName');
          socket.emit('call:busy', {
            receiverId,
            message: `${otherUser?.displayName || 'User'} is currently in another call`,
          });
          return;
        }

        // Verify caller and receiver exist
        const [callerUser, receiverUser] = await Promise.all([
          User.findById(userId).select('_id displayName avatarUrl username'),
          User.findById(receiverId).select('_id displayName avatarUrl username fcmTokens'),
        ]);

        if (!callerUser || !receiverUser) {
          socket.emit('call:error', { message: 'User profile not found' });
          return;
        }

        // Generate unique call ID
        const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const newCall = new Call({
          callId,
          callerId: userId,
          receiverId,
          conversationId,
          callType,
          status: 'calling',
          startedAt: new Date(),
        });
        await newCall.save();

        // Store in fast memory map
        activeCallsMap.set(callId, {
          callId,
          callerId: userId,
          receiverId,
          conversationId,
        });

        console.log(`[Call] ${callerUser.displayName} initiated call ${callId} to ${receiverUser.displayName}`);

        // Acknowledge to caller
        socket.emit('call:initiated', {
          callId,
          receiver: {
            _id: receiverUser._id,
            displayName: receiverUser.displayName,
            avatar: receiverUser.avatarUrl,
            username: receiverUser.username,
          },
          conversationId,
          callType,
          status: 'calling',
        });

        // Emit incoming call to receiver's socket room
        io.to(`user:${receiverId}`).emit('call:incoming', {
          callId,
          caller: {
            _id: callerUser._id,
            displayName: callerUser.displayName,
            avatar: callerUser.avatarUrl,
            username: callerUser.username,
          },
          conversationId,
          callType,
        });

        // Dispatch high-priority FCM Call Push Notification
        sendCallPushNotification({
          recipientId: receiverId,
          callerId: userId,
          callerName: callerUser.displayName || 'Kotha Hobe User',
          callerAvatar: callerUser.avatarUrl,
          callId,
          conversationId,
          callType,
        }).catch((err) => console.warn('[Call] FCM push dispatch error:', err));

        // Start 45-second Ringing Timeout
        const timeout = setTimeout(async () => {
          try {
            const currentCall = await Call.findOne({ callId });
            if (currentCall && (currentCall.status === 'calling' || currentCall.status === 'ringing')) {
              console.log(`[Call] Call ${callId} timed out (missed)`);
              currentCall.status = 'missed';
              currentCall.endedAt = new Date();
              await currentCall.save();

              activeCallsMap.delete(callId);

              io.to(`user:${userId}`).emit('call:timeout', { callId });
              io.to(`user:${receiverId}`).emit('call:timeout', { callId });

              // Dismiss native incoming call notification on receiver device
              sendCallCancelledPushNotification({ recipientId: receiverId, callId }).catch(() => {});

              // Record Missed Call message in conversation
              const missedMsg = new Message({
                conversationId,
                senderId: userId,
                receiverId,
                text: '📞 Missed voice call',
                type: 'call',
                status: 'delivered',
                clientMessageId: `call_msg_${callId}`,
                callDetails: {
                  callId,
                  callType: 'voice',
                  status: 'missed',
                  duration: 0,
                  startedAt: currentCall.startedAt,
                  endedAt: currentCall.endedAt,
                },
              });
              await missedMsg.save();

              io.to(`conv:${conversationId}`).emit('message:new', missedMsg);
              io.to(`user:${userId}`).emit('message:new', missedMsg);
              io.to(`user:${receiverId}`).emit('message:new', missedMsg);
            }
          } catch (err) {
            console.error('[Call] Timeout handler error:', err);
          } finally {
            callTimeouts.delete(callId);
          }
        }, 45000);

        callTimeouts.set(callId, timeout);
      } catch (err: any) {
        console.error('[Call] Initiate error:', err);
        socket.emit('call:error', { message: err?.message || 'Failed to initiate call' });
      }
    }
  );

  // 2. Receiver Acknowledges Ringing
  socket.on('call:ringing', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) return;

      const mem = activeCallsMap.get(callId);
      if (mem) {
        io.to(`user:${mem.callerId}`).emit('call:ringing', { callId });
      }

      Call.updateOne({ callId, status: 'calling' }, { status: 'ringing' }).catch(() => {});
    } catch (err) {
      console.error('[Call] Ringing error:', err);
    }
  });

  // 3. Receiver Accepts Call
  socket.on('call:accept', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) return;

      const timeout = callTimeouts.get(callId);
      if (timeout) {
        clearTimeout(timeout);
        callTimeouts.delete(callId);
      }

      let mem = activeCallsMap.get(callId);
      if (!mem) {
        const call = await Call.findOne({ callId });
        if (call) {
          mem = {
            callId,
            callerId: call.callerId.toString(),
            receiverId: call.receiverId.toString(),
            conversationId: call.conversationId.toString(),
          };
          activeCallsMap.set(callId, mem);
        }
      }

      if (!mem || mem.receiverId !== userId) {
        socket.emit('call:error', { message: 'Unauthorized call accept' });
        return;
      }

      console.log(`[Call] Call ${callId} accepted by receiver. Signaling caller to start WebRTC offer...`);

      // Forward immediately to caller ONLY so only caller creates SDP Offer (prevents DTLS role glare)
      io.to(`user:${mem.callerId}`).emit('call:accepted', { callId });

      Call.updateOne({ callId }, { status: 'accepted', answeredAt: new Date() }).catch(() => {});
    } catch (err) {
      console.error('[Call] Accept error:', err);
    }
  });

  // 4. WebRTC Connection Established ("connected")
  socket.on('call:connected', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) return;

      const mem = activeCallsMap.get(callId);
      const connectedAt = new Date();

      if (mem) {
        io.to(`user:${mem.callerId}`).emit('call:connected', { callId, connectedAt });
        io.to(`user:${mem.receiverId}`).emit('call:connected', { callId, connectedAt });
      }

      Call.updateOne({ callId, status: { $ne: 'connected' } }, { status: 'connected', connectedAt }).catch(() => {});
    } catch (err) {
      console.error('[Call] Connected handler error:', err);
    }
  });

  // 5. Fast WebRTC SDP Offer Relay
  socket.on('call:offer', async (data: { callId: string; sdp: any }) => {
    try {
      const { callId, sdp } = data;
      if (!callId || !sdp) return;

      let mem = activeCallsMap.get(callId);
      if (!mem) {
        const call = await Call.findOne({ callId });
        if (call) {
          mem = {
            callId,
            callerId: call.callerId.toString(),
            receiverId: call.receiverId.toString(),
            conversationId: call.conversationId.toString(),
          };
          activeCallsMap.set(callId, mem);
        }
      }

      if (!mem) return;

      const targetId = mem.callerId === userId ? mem.receiverId : mem.callerId;
      console.log(`[Call] ⚡ Relaying SDP offer for call ${callId} to user ${targetId}`);
      io.to(`user:${targetId}`).emit('call:offer', { callId, sdp });
    } catch (err) {
      console.error('[Call] Offer error:', err);
    }
  });

  // 6. Fast WebRTC SDP Answer Relay
  socket.on('call:answer', async (data: { callId: string; sdp: any }) => {
    try {
      const { callId, sdp } = data;
      if (!callId || !sdp) return;

      let mem = activeCallsMap.get(callId);
      if (!mem) {
        const call = await Call.findOne({ callId });
        if (call) {
          mem = {
            callId,
            callerId: call.callerId.toString(),
            receiverId: call.receiverId.toString(),
            conversationId: call.conversationId.toString(),
          };
          activeCallsMap.set(callId, mem);
        }
      }

      if (!mem) return;

      const targetId = mem.callerId === userId ? mem.receiverId : mem.callerId;
      console.log(`[Call] ⚡ Relaying SDP answer for call ${callId} to user ${targetId}`);
      io.to(`user:${targetId}`).emit('call:answer', { callId, sdp });
    } catch (err) {
      console.error('[Call] Answer error:', err);
    }
  });

  // 7. Fast WebRTC ICE Candidate Relay (0ms latency, zero database blocking)
  socket.on('call:ice-candidate', async (data: { callId: string; candidate: any; traceId?: string }) => {
    try {
      const { callId, candidate, traceId } = data;
      if (!callId || !candidate) return;

      const raw = candidate?.candidate || '';
      const type = raw.includes('typ srflx') ? 'srflx' : raw.includes('typ relay') ? 'relay' : raw.includes('typ host') ? 'host' : 'other';
      console.log(`[ICE_SERVER_RECEIVED] callId=${callId} traceId=${traceId || 'none'} from=${userId} type=${type}`);

      let mem = activeCallsMap.get(callId);
      if (!mem) {
        const call = await Call.findOne({ callId });
        if (call) {
          mem = {
            callId,
            callerId: call.callerId.toString(),
            receiverId: call.receiverId.toString(),
            conversationId: call.conversationId.toString(),
          };
          activeCallsMap.set(callId, mem);
        }
      }

      if (!mem) {
        console.warn(`[ICE_SERVER_DROP] callId=${callId} active call memory not found for candidate`);
        return;
      }

      const targetId = mem.callerId === userId ? mem.receiverId : mem.callerId;
      console.log(`[ICE_SERVER_FORWARDED] callId=${callId} traceId=${traceId || 'none'} to user=${targetId} type=${type}`);
      io.to(`user:${targetId}`).emit('call:ice-candidate', { callId, candidate, traceId });
    } catch (err) {
      console.error('[Call] ICE candidate error:', err);
    }
  });

  // 8. Receiver Declines Call
  socket.on('call:reject', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) return;

      const timeout = callTimeouts.get(callId);
      if (timeout) {
        clearTimeout(timeout);
        callTimeouts.delete(callId);
      }

      const mem = activeCallsMap.get(callId);
      activeCallsMap.delete(callId);

      const call = await Call.findOne({ callId });
      if (!call) return;

      call.status = 'declined';
      call.endedAt = new Date();
      await call.save();

      console.log(`[Call] Call ${callId} declined by receiver.`);

      io.to(`user:${call.callerId.toString()}`).emit('call:rejected', { callId });
      socket.emit('call:rejected', { callId });

      // Save Declined Call event in conversation
      const callMsg = new Message({
        conversationId: call.conversationId,
        senderId: call.callerId,
        receiverId: call.receiverId,
        text: '📞 Declined voice call',
        type: 'call',
        status: 'delivered',
        clientMessageId: `call_msg_${callId}`,
        callDetails: {
          callId,
          callType: 'voice',
          status: 'declined',
          duration: 0,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
        },
      });
      await callMsg.save();

      io.to(`conv:${call.conversationId.toString()}`).emit('message:new', callMsg);
      io.to(`user:${call.callerId.toString()}`).emit('message:new', callMsg);
      io.to(`user:${call.receiverId.toString()}`).emit('message:new', callMsg);
    } catch (err) {
      console.error('[Call] Reject error:', err);
    }
  });

  // 9. Caller Cancels Before Answer
  socket.on('call:cancel', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) return;

      const timeout = callTimeouts.get(callId);
      if (timeout) {
        clearTimeout(timeout);
        callTimeouts.delete(callId);
      }

      activeCallsMap.delete(callId);

      const call = await Call.findOne({ callId });
      if (!call) return;

      call.status = 'cancelled';
      call.endedAt = new Date();
      await call.save();

      console.log(`[Call] Call ${callId} cancelled by caller.`);

      io.to(`user:${call.receiverId.toString()}`).emit('call:cancelled', { callId });
      socket.emit('call:cancelled', { callId });

      // Dismiss native incoming call notification on receiver device
      sendCallCancelledPushNotification({ recipientId: call.receiverId.toString(), callId }).catch(() => {});

      // Save Missed Call event
      const callMsg = new Message({
        conversationId: call.conversationId,
        senderId: call.callerId,
        receiverId: call.receiverId,
        text: '📞 Missed voice call',
        type: 'call',
        status: 'delivered',
        clientMessageId: `call_msg_${callId}`,
        callDetails: {
          callId,
          callType: 'voice',
          status: 'cancelled',
          duration: 0,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
        },
      });
      await callMsg.save();

      io.to(`conv:${call.conversationId.toString()}`).emit('message:new', callMsg);
      io.to(`user:${call.callerId.toString()}`).emit('message:new', callMsg);
      io.to(`user:${call.receiverId.toString()}`).emit('message:new', callMsg);
    } catch (err) {
      console.error('[Call] Cancel error:', err);
    }
  });

  // 10. Either User Ends Active Call
  socket.on('call:end', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) return;

      const timeout = callTimeouts.get(callId);
      if (timeout) {
        clearTimeout(timeout);
        callTimeouts.delete(callId);
      }

      activeCallsMap.delete(callId);

      const call = await Call.findOne({ callId });
      if (!call) return;

      const endedAt = new Date();
      let duration = 0;
      if (call.connectedAt) {
        duration = Math.max(0, Math.round((endedAt.getTime() - new Date(call.connectedAt).getTime()) / 1000));
      }

      call.status = 'ended';
      call.endedAt = endedAt;
      call.duration = duration;
      await call.save();

      console.log(`[Call] Call ${callId} ended. Total duration: ${duration}s`);

      io.to(`user:${call.callerId.toString()}`).emit('call:ended', { callId, duration });
      io.to(`user:${call.receiverId.toString()}`).emit('call:ended', { callId, duration });

      // Save in-chat Call Record
      const durText = formatDurationText(duration);
      const callMsg = new Message({
        conversationId: call.conversationId,
        senderId: call.callerId,
        receiverId: call.receiverId,
        text: `📞 Voice call (${durText})`,
        type: 'call',
        status: 'delivered',
        clientMessageId: `call_msg_${callId}`,
        callDetails: {
          callId,
          callType: 'voice',
          status: 'completed',
          duration,
          startedAt: call.startedAt,
          endedAt,
        },
      });
      await callMsg.save();

      io.to(`conv:${call.conversationId.toString()}`).emit('message:new', callMsg);
      io.to(`user:${call.callerId.toString()}`).emit('message:new', callMsg);
      io.to(`user:${call.receiverId.toString()}`).emit('message:new', callMsg);
    } catch (err) {
      console.error('[Call] End error:', err);
    }
  });

  // 11. Client Reports WebRTC Connection Failed
  socket.on('call:failed', async (data: { callId: string }) => {
    try {
      const { callId } = data;
      if (!callId) return;

      activeCallsMap.delete(callId);

      const call = await Call.findOne({ callId });
      if (!call) return;

      call.status = 'failed';
      call.endedAt = new Date();
      await call.save();

      console.log(`[Call] Call ${callId} marked as failed by client`);
      io.to(`user:${call.callerId.toString()}`).emit('call:failed', { callId });
      io.to(`user:${call.receiverId.toString()}`).emit('call:failed', { callId });
    } catch (err) {
      console.error('[Call] Failed handler error:', err);
    }
  });

  // 12. Socket Disconnect Auto-Cleanup
  socket.on('disconnect', async () => {
    try {
      for (const [cId, mem] of activeCallsMap.entries()) {
        if (mem.callerId === userId || mem.receiverId === userId) {
          activeCallsMap.delete(cId);
        }
      }

      await Call.updateMany(
        {
          $or: [{ callerId: userId }, { receiverId: userId }],
          status: { $in: ['calling', 'ringing', 'accepted'] },
        },
        { $set: { status: 'ended', endedAt: new Date() } }
      );
    } catch (err) {
      // Ignore during disconnect
    }
  });
}
