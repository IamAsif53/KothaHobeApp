import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message, MessageStatus, MessageType, IAttachment, IReplyTo } from '../models/Message';
import { sendPushNotification } from '../services/notificationService';
import { registerCallHandlers } from './callHandler';
import { registerGroupCallHandlers } from './groupCallHandler';
import { isValidCustomEmojiId } from '../utils/customEmojiCatalog';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  phoneNumber?: string;
  sessionId?: string;
}

let globalIO: SocketIOServer | null = null;

export function getGlobalIO(): SocketIOServer | null {
  return globalIO;
}

export function setupSocketIO(io: SocketIOServer): void {
  globalIO = io;
  // Handshake authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
        (socket.handshake.query?.token as string);

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = verifyToken(token);
      if (!decoded || !decoded.userId) {
        return next(new Error('Invalid or expired token'));
      }

      // If sessionId is present in token, verify it's still active in DB
      if (decoded.sessionId) {
        const user = await User.findById(decoded.userId).select('sessions');
        if (user && user.sessions && user.sessions.length > 0) {
          const hasSession = user.sessions.some((s) => s.sessionId === decoded.sessionId);
          if (!hasSession) {
            return next(new Error('Session has been revoked'));
          }
        }
      }

      socket.userId = decoded.userId;
      socket.sessionId = decoded.sessionId;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    if (!userId) {
      socket.disconnect();
      return;
    }

    console.log(`[Socket] Connected: user ${userId} (socket ID: ${socket.id})`);

    // Join personal user room for private messages
    socket.join(`user:${userId}`);

    // Synchronize missed / undelivered messages immediately on socket connect
    const syncMissedMessages = async (sinceTimestamp?: string) => {
      try {
        const sinceDate = sinceTimestamp
          ? new Date(sinceTimestamp)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // 1. Direct messages where user is recipient
        const directMessages = await Message.find({
          receiverId: userId,
          createdAt: { $gte: sinceDate },
          deletedFor: { $ne: userId },
        })
          .sort({ createdAt: 1 })
          .limit(100);

        // Mark any 'sent' direct messages as 'delivered'
        const undeliveredDirect = directMessages.filter((m) => m.status === 'sent');
        if (undeliveredDirect.length > 0) {
          const now = new Date();
          const undeliveredIds = undeliveredDirect.map((m) => m._id);
          await Message.updateMany(
            { _id: { $in: undeliveredIds } },
            { $set: { status: 'delivered', deliveredAt: now } }
          );

          undeliveredDirect.forEach((m) => {
            m.status = 'delivered';
            m.deliveredAt = now;
            io.to(`user:${m.senderId}`).emit('message:delivered', {
              _id: m._id,
              clientMessageId: m.clientMessageId,
              conversationId: m.conversationId,
              deliveredAt: now,
            });
          });
        }

        // 2. Group messages where user is a member
        const userGroupConvs = await Conversation.find({
          isGroup: true,
          $or: [
            { participants: userId },
            { 'groupMeta.members.user': userId },
            { 'groupMeta.creator': userId },
          ],
        }).select('_id');

        let groupMessages: any[] = [];
        if (userGroupConvs.length > 0) {
          const groupConvIds = userGroupConvs.map((c) => c._id);
          groupMessages = await Message.find({
            conversationId: { $in: groupConvIds },
            senderId: { $ne: userId },
            createdAt: { $gte: sinceDate },
            deletedFor: { $ne: userId },
          })
            .sort({ createdAt: 1 })
            .limit(100);
        }

        const combined = [...directMessages, ...groupMessages].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        if (combined.length > 0) {
          console.log(`[SocketSync] ⚡ Emitting ${combined.length} missed message(s) to user ${userId}`);
          socket.emit('message:sync', {
            messages: combined,
            serverTime: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('[Socket] Failed to sync missed messages:', err);
      }
    };

    // Update user online status
    try {
      const currentUserDoc = await User.findById(userId).select('privacySettings');
      const allowPresence = currentUserDoc?.privacySettings?.onlinePresence !== false;

      if (allowPresence) {
        await User.findByIdAndUpdate(userId, {
          isOnline: true,
          lastSeen: new Date(),
        });

        socket.broadcast.emit('user:online', { userId, isOnline: true });
      }

      // Proactively sync all pending & missed messages immediately
      await syncMissedMessages();
    } catch (err) {
      console.error('[Socket] Failed to update online/sync status on connect:', err);
    }

    // Client requests explicit fast delta sync
    socket.on('message:sync_request', async (data?: { since?: string }) => {
      await syncMissedMessages(data?.since);
    });

    // Recipient Client Acknowledges Message Delivery
    socket.on('message:delivered', async (data: { messageId?: string; clientMessageId?: string; conversationId?: string }) => {
      try {
        const query: any = { receiverId: userId, status: 'sent' };
        if (data.messageId) query._id = data.messageId;
        else if (data.clientMessageId) query.clientMessageId = data.clientMessageId;

        const now = new Date();
        const updated = await Message.findOneAndUpdate(
          query,
          { status: 'delivered', deliveredAt: now },
          { new: true }
        );

        if (updated) {
          io.to(`user:${updated.senderId}`).emit('message:delivered', {
            _id: updated._id,
            clientMessageId: updated.clientMessageId,
            conversationId: updated.conversationId,
            deliveredAt: now,
          });
        }
      } catch (e) {
        console.warn('[Socket] message:delivered acknowledge error:', e);
      }
    });

    // Join / Leave conversation rooms
    socket.on('conversation:join', (conversationId: string) => {
      if (conversationId) {
        socket.join(`conv:${conversationId}`);
      }
    });

    socket.on('conversation:leave', (conversationId: string) => {
      if (conversationId) {
        socket.leave(`conv:${conversationId}`);
      }
    });

    // Send Message (Text / Image / Document / Audio) - Supports Direct and Group Chats
    socket.on(
      'message:send',
      async (data: {
        conversationId: string;
        receiverId?: string;
        text?: string;
        clientMessageId: string;
        type?: MessageType;
        attachment?: IAttachment;
        replyTo?: IReplyTo;
        customEmojiId?: string;
      }) => {
        try {
          const {
            conversationId,
            receiverId,
            text = '',
            clientMessageId,
            type = 'text',
            attachment,
            replyTo,
            customEmojiId,
          } = data;

          if (!conversationId || !clientMessageId) {
            socket.emit('message:error', {
              clientMessageId,
              message: 'Missing required message parameters',
            });
            return;
          }

          // Validate conversation membership
          const conversation = await Conversation.findOne({
            _id: conversationId,
            $or: [
              { participants: userId },
              { 'groupMeta.members.user': userId },
              { 'groupMeta.creator': userId },
            ],
          });

          if (!conversation) {
            socket.emit('message:error', {
              clientMessageId,
              message: 'Unauthorized conversation access',
            });
            return;
          }

          // Idempotency check: Return existing message if already saved
          let message = await Message.findOne({ clientMessageId });

          if (!message) {
            // Count total messages for server sequence
            const count = await Message.countDocuments({ conversationId });
            const serverSequence = count + 1;

            const senderUser = await User.findById(userId).select('displayName username avatarUrl');

            // Check if group has a custom nickname set for sender
            let senderNickname = senderUser?.displayName || senderUser?.username || '';
            if (conversation.isGroup && conversation.groupMeta?.nicknames) {
              const nicks = conversation.groupMeta.nicknames;
              const customNick = nicks instanceof Map ? nicks.get(userId) : (nicks as any)[userId];
              if (customNick) senderNickname = customNick;
            }

            const validatedCustomEmojiId =
              type === 'custom_emoji'
                ? (isValidCustomEmojiId(customEmojiId) ? customEmojiId : (isValidCustomEmojiId(text) ? text.trim() : undefined))
                : undefined;

            if (conversation.isGroup) {
              // Check sendMessages permission
              if (conversation.groupMeta?.permissions?.sendMessages === 'admins') {
                const uIdStr = userId.toString();
                const isCreator = conversation.groupMeta.creator?.toString() === uIdStr;
                const isAdmin = conversation.groupMeta.admins?.some((a: any) => a?.toString() === uIdStr);
                const isMod = conversation.groupMeta.moderators?.some((m: any) => m?.toString() === uIdStr);
                if (!isCreator && !isAdmin && !isMod) {
                  socket.emit('message:error', {
                    clientMessageId,
                    message: 'Only admins and moderators can send messages in this group.',
                  });
                  return;
                }
              }

              // Disappearing message expiration
              let expiresAt: Date | undefined = undefined;
              if (conversation.groupMeta?.disappearingMode && conversation.groupMeta.disappearingMode > 0) {
                expiresAt = new Date(Date.now() + conversation.groupMeta.disappearingMode * 1000);
              }

              // --- GROUP CHAT MESSAGE ---
              message = await Message.create({
                conversationId,
                senderId: userId,
                senderNickname,
                text: text.trim(),
                type,
                customEmojiId: validatedCustomEmojiId,
                status: 'delivered',
                readBy: [{ user: userId as any, readAt: new Date() }],
                clientMessageId,
                attachment: attachment || undefined,
                replyTo: replyTo || undefined,
                serverSequence,
                expiresAt,
                deliveredAt: new Date(),
              });

              let previewText = text.trim();
              if (type === 'image') previewText = '📷 Photo';
              else if (type === 'audio') previewText = '🎤 Voice message';
              else if (type === 'document') previewText = `📄 ${attachment?.fileName || 'Document'}`;
              else if (type === 'custom_emoji') previewText = '✨ Animated Emoji';

              await Conversation.findByIdAndUpdate(conversationId, {
                lastMessage: {
                  text: `${senderNickname}: ${previewText}`,
                  senderId: userId,
                  createdAt: message.createdAt,
                  status: 'delivered',
                },
                lastMessageAt: message.createdAt,
              });

              // 1. Confirm to sender
              socket.emit('message:sent', message);

              // 2. Emit to conversation room (for anyone currently inside chat room)
              io.to(`conv:${conversationId}`).emit('message:new', message);

              // 3. Emit and push to all other group participants & members
              const allMemberIds = new Set<string>();
              (conversation.participants || []).forEach((p: any) => allMemberIds.add(p.toString()));
              (conversation.groupMeta?.members || []).forEach((m: any) => {
                const mId = m.user?._id?.toString() || m.user?.toString();
                if (mId && m.status === 'accepted') allMemberIds.add(mId);
              });
              allMemberIds.delete(userId);

              allMemberIds.forEach((pIdStr) => {
                io.to(`user:${pIdStr}`).emit('message:new', message);

                sendPushNotification({
                  recipientId: pIdStr,
                  senderId: userId,
                  messageId: message!._id.toString(),
                  senderName: senderNickname,
                  senderNickname: senderNickname,
                  senderAvatar: senderUser?.avatarUrl || '',
                  isGroup: true,
                  groupName: conversation.groupMeta?.name || 'Group Chat',
                  groupAvatar: conversation.groupMeta?.avatarUrl || '',
                  messageText: text.trim(),
                  messageType: type,
                  attachmentFileName: attachment?.fileName,
                  customEmojiId: validatedCustomEmojiId,
                  conversationId,
                }).catch(() => {});
              });
            } else {
              // --- 1-TO-1 DIRECT CHAT MESSAGE ---
              const targetReceiverId = receiverId || conversation.participants.find((p) => p.toString() !== userId)?.toString();
              if (!targetReceiverId) {
                socket.emit('message:error', { clientMessageId, message: 'Receiver not found' });
                return;
              }

              const recipientSockets = await io.in(`user:${targetReceiverId}`).fetchSockets();
              const initialStatus: MessageStatus = recipientSockets.length > 0 ? 'delivered' : 'sent';

              message = await Message.create({
                conversationId,
                senderId: userId,
                receiverId: targetReceiverId,
                text: text.trim(),
                type,
                customEmojiId: validatedCustomEmojiId,
                status: initialStatus,
                clientMessageId,
                attachment: attachment || undefined,
                replyTo: replyTo || undefined,
                serverSequence,
                deliveredAt: recipientSockets.length > 0 ? new Date() : undefined,
              });

              let previewText = text.trim();
              if (type === 'image') previewText = '📷 Photo';
              else if (type === 'audio') previewText = '🎤 Voice message';
              else if (type === 'document') previewText = `📄 ${attachment?.fileName || 'Document'}`;
              else if (type === 'custom_emoji') previewText = '✨ Animated Emoji';

              await Conversation.findByIdAndUpdate(conversationId, {
                lastMessage: {
                  text: previewText,
                  senderId: userId,
                  createdAt: message.createdAt,
                  status: initialStatus,
                },
                lastMessageAt: message.createdAt,
              });

              // 1. Confirm to sender
              socket.emit('message:sent', message);

              // 2. Emit to recipient and conversation room in real time (0ms direct delivery)
              io.to(`user:${targetReceiverId}`).emit('message:new', message);
              io.to(`conv:${conversationId}`).emit('message:new', message);

              // 3. Dispatch FCM Push Notification
              sendPushNotification({
                recipientId: targetReceiverId,
                senderId: userId,
                messageId: message._id.toString(),
                senderName: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
                senderNickname: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
                senderAvatar: senderUser?.avatarUrl || '',
                isGroup: false,
                messageText: text.trim(),
                messageType: type,
                attachmentFileName: attachment?.fileName,
                customEmojiId: validatedCustomEmojiId,
                conversationId,
              })
                .then(async (pushRes) => {
                  if (pushRes && pushRes.success && pushRes.successCount > 0) {
                    const now = new Date();
                    const updatedMsg = await Message.findOneAndUpdate(
                      { _id: message!._id, status: 'sent' },
                      { status: 'delivered', deliveredAt: now },
                      { new: true }
                    );

                    if (updatedMsg) {
                      await Conversation.updateOne(
                        { _id: conversationId, 'lastMessage.createdAt': message!.createdAt },
                        { $set: { 'lastMessage.status': 'delivered' } }
                      );

                      io.to(`user:${userId}`).emit('message:delivered', {
                        _id: updatedMsg._id,
                        clientMessageId: updatedMsg.clientMessageId,
                        conversationId: updatedMsg.conversationId,
                        deliveredAt: now,
                      });
                    }
                  }
                })
                .catch((err) => console.warn('[Push] Dispatch notice:', err));

              if (message.status === 'delivered') {
                socket.emit('message:delivered', {
                  _id: message._id,
                  clientMessageId: message.clientMessageId,
                  conversationId: message.conversationId,
                  deliveredAt: message.deliveredAt,
                });
              }
            }
          } else {
            socket.emit('message:sent', message);
          }
        } catch (error) {
          console.error('[Socket] message:send error:', error);
          socket.emit('message:error', {
            clientMessageId: data?.clientMessageId,
            message: 'Failed to process message',
          });
        }
      }
    );

    // Toggle Reaction on Message (Direct & Group)
    socket.on(
      'message:react',
      async (data: { messageId: string; conversationId: string; emoji: string }) => {
        try {
          const { messageId, conversationId, emoji } = data;
          if (!messageId || !conversationId || !emoji) return;

          const msg = await Message.findById(messageId);
          if (!msg) return;

          const existingIndex = msg.reactions.findIndex(
            (r) => r.userId.toString() === userId && r.emoji === emoji
          );

          if (existingIndex > -1) {
            // Remove reaction if tapped again
            msg.reactions.splice(existingIndex, 1);
          } else {
            // Add or replace reaction from this user
            msg.reactions = msg.reactions.filter((r) => r.userId.toString() !== userId);
            msg.reactions.push({
              userId,
              emoji,
              createdAt: new Date(),
            });
          }

          await msg.save();

          // Broadcast reaction update to conversation room
          io.to(`conv:${conversationId}`).emit('message:reaction_updated', {
            messageId,
            conversationId,
            reactions: msg.reactions,
          });

          // Also broadcast to all conversation participants
          const conv = await Conversation.findById(conversationId).select('participants isGroup');
          if (conv) {
            conv.participants.forEach((p) => {
              io.to(`user:${p.toString()}`).emit('message:reaction_updated', {
                messageId,
                conversationId,
                reactions: msg.reactions,
              });
            });
          }
        } catch (error) {
          console.error('[Socket] message:react error:', error);
        }
      }
    );

    // Delete Message (Delete for me / Delete for everyone)
    socket.on(
      'message:delete',
      async (data: { messageId: string; conversationId: string; deleteForEveryone: boolean }) => {
        try {
          const { messageId, conversationId, deleteForEveryone } = data;
          if (!messageId || !conversationId) return;

          const msg = await Message.findById(messageId);
          if (!msg) return;

          if (deleteForEveryone && msg.senderId.toString() === userId) {
            msg.isDeletedForEveryone = true;
            msg.text = 'This message was deleted';
            msg.attachment = undefined;
            await msg.save();

            io.to(`conv:${conversationId}`).emit('message:deleted', {
              messageId,
              conversationId,
              deleteForEveryone: true,
            });

            const conv = await Conversation.findById(conversationId).select('participants');
            if (conv) {
              conv.participants.forEach((p) => {
                io.to(`user:${p.toString()}`).emit('message:deleted', {
                  messageId,
                  conversationId,
                  deleteForEveryone: true,
                });
              });
            }
          } else {
            // Delete for me only
            await Message.findByIdAndUpdate(messageId, {
              $addToSet: { deletedFor: userId },
            });

            socket.emit('message:deleted', {
              messageId,
              conversationId,
              deleteForEveryone: false,
            });
          }
        } catch (error) {
          console.error('[Socket] message:delete error:', error);
        }
      }
    );

    // Mark Messages as Read (Supports 1-to-1 and Group readBy)
    socket.on('message:read', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        const conv = await Conversation.findById(conversationId);
        if (!conv) return;

        const senderUser = await User.findById(userId).select('privacySettings');
        const sendReceipts = senderUser?.privacySettings?.readReceipts !== false;

        const now = new Date();

        if (conv.isGroup) {
          // In Group Chat: add user to readBy array for all messages not sent by user
          await Message.updateMany(
            {
              conversationId,
              senderId: { $ne: userId },
              'readBy.user': { $ne: userId },
            },
            {
              $addToSet: { readBy: { user: userId, readAt: now } },
            }
          );

          if (sendReceipts) {
            io.to(`conv:${conversationId}`).emit('message:read', {
              conversationId,
              readBy: userId,
              readAt: now,
            });
          }
          io.to(`user:${userId}`).emit('message:read', {
            conversationId,
            readBy: userId,
            readAt: now,
          });
        } else {
          // In 1-to-1 Chat: ALWAYS update database status to 'read' so recipient unread count clears
          await Message.updateMany(
            {
              conversationId,
              senderId: { $ne: userId },
              status: { $in: ['sending', 'sent', 'delivered'] },
            },
            {
              $set: { status: 'read', readAt: now },
              $addToSet: { readBy: { user: userId, readAt: now } },
            }
          );

          await Conversation.updateOne(
            { _id: conversationId, 'lastMessage.senderId': { $ne: userId } },
            { $set: { 'lastMessage.status': 'read' } }
          );

          const otherParticipantId = conv.participants.find(
            (p) => p.toString() !== userId
          );

          // Only send blue tick receipt to sender if current user allows read receipts
          if (sendReceipts && otherParticipantId) {
            io.to(`user:${otherParticipantId.toString()}`).emit('message:read', {
              conversationId,
              readBy: userId,
              readAt: now,
            });
          }
          io.to(`user:${userId}`).emit('message:read', {
            conversationId,
            readBy: userId,
            readAt: now,
          });
        }
      } catch (error) {
        console.error('[Socket] message:read error:', error);
      }
    });

    // Typing Indicators (Direct 1-on-1 Chat Room Broadcast)
    socket.on('typing:start', async (data: { conversationId: string; receiverId?: string }) => {
      try {
        if (!data?.receiverId) return;
        const senderUser = await User.findById(userId).select('privacySettings');
        if (senderUser?.privacySettings?.typingIndicators === false) return;

        io.to(`user:${data.receiverId}`).emit('typing:start', {
          conversationId: data.conversationId,
          userId,
        });
      } catch (err) {
        console.warn('[Socket] typing:start error:', err);
      }
    });

    socket.on('typing:stop', (data: { conversationId: string; receiverId?: string }) => {
      if (data?.receiverId) {
        io.to(`user:${data.receiverId}`).emit('typing:stop', {
          conversationId: data.conversationId,
          userId,
        });
      }
    });

    // Group-Only Typing Indicators (Aggregated with Name Attribution)
    socket.on('group:typing:start', async (data: { conversationId: string }) => {
      try {
        if (!data?.conversationId) return;
        const senderUser = await User.findById(userId).select('privacySettings displayName username');
        if (senderUser?.privacySettings?.typingIndicators === false) return;

        const conv = await Conversation.findById(data.conversationId).select('isGroup groupMeta participants');
        if (!conv || !conv.isGroup) return;

        let displayName = '';
        if (conv.groupMeta?.nicknames) {
          const nicks = conv.groupMeta.nicknames;
          const nick = nicks instanceof Map ? nicks.get(userId) : (nicks as any)[userId];
          if (nick) displayName = nick;
        }

        if (!displayName) {
          displayName = senderUser?.displayName || senderUser?.username || 'Member';
        }

        socket.to(`conv:${data.conversationId}`).emit('group:typing:update', {
          conversationId: data.conversationId,
          userId,
          displayName,
          isTyping: true,
        });
      } catch (err) {
        console.warn('[Socket] group:typing:start error:', err);
      }
    });

    socket.on('group:typing:stop', async (data: { conversationId: string }) => {
      try {
        if (!data?.conversationId) return;
        socket.to(`conv:${data.conversationId}`).emit('group:typing:update', {
          conversationId: data.conversationId,
          userId,
          isTyping: false,
        });
      } catch (err) {
        console.warn('[Socket] group:typing:stop error:', err);
      }
    });

    // Lightweight Heartbeat / Ping Handler for mobile keep-alive
    socket.on('heartbeat', () => {
      socket.emit('heartbeat:ack', { timestamp: Date.now() });
    });

    // Register 1-to-1 WebRTC Call Signaling Handlers
    registerCallHandlers(io, socket);

    // Register Multi-Party Group Call Handlers
    registerGroupCallHandlers(io, socket);

    // Disconnection handling
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: user ${userId}`);

      try {
        const remainingSockets = await io.in(`user:${userId}`).fetchSockets();
        if (remainingSockets.length === 0) {
          const userDoc = await User.findById(userId).select('privacySettings');
          const allowPresence = userDoc?.privacySettings?.onlinePresence !== false;
          const lastSeenPrivacy = userDoc?.privacySettings?.lastSeen || 'everyone';

          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen,
          });

          if (allowPresence) {
            socket.broadcast.emit('user:offline', {
              userId,
              isOnline: false,
              lastSeen: lastSeenPrivacy !== 'nobody' ? lastSeen : undefined,
            });
          }
        }
      } catch (err) {
        // Ignore during teardown
      }
    });
  });
}
