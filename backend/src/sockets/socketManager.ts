import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message, MessageStatus, IAttachment, IReplyTo } from '../models/Message';
import { sendPushNotification } from '../services/notificationService';
import { registerCallHandlers } from './callHandler';
import { registerGroupCallHandlers } from './groupCallHandler';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  phoneNumber?: string;
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

      socket.userId = decoded.userId;
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

    // Update user online status & mark all pending messages sent to this user as DELIVERED
    try {
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: new Date(),
      });

      socket.broadcast.emit('user:online', { userId, isOnline: true });

      // Find all pending 'sent' messages where this connected user is the recipient
      const pendingMessages = await Message.find({
        receiverId: userId,
        status: 'sent',
      }).select('_id senderId conversationId clientMessageId');

      if (pendingMessages.length > 0) {
        const now = new Date();
        await Message.updateMany(
          { receiverId: userId, status: 'sent' },
          { $set: { status: 'delivered', deliveredAt: now } }
        );

        pendingMessages.forEach((m) => {
          io.to(`user:${m.senderId}`).emit('message:delivered', {
            _id: m._id,
            clientMessageId: m.clientMessageId,
            conversationId: m.conversationId,
            deliveredAt: now,
          });
        });
      }
    } catch (err) {
      console.error('[Socket] Failed to update online/delivery status on connect:', err);
    }

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
        type?: 'text' | 'image' | 'video' | 'audio' | 'document';
        attachment?: IAttachment;
        replyTo?: IReplyTo;
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
              const customNick = (conversation.groupMeta.nicknames as any)[userId];
              if (customNick) senderNickname = customNick;
            }

            if (conversation.isGroup) {
              // --- GROUP CHAT MESSAGE ---
              message = await Message.create({
                conversationId,
                senderId: userId,
                senderNickname,
                text: text.trim(),
                type,
                status: 'delivered',
                readBy: [userId],
                clientMessageId,
                attachment: attachment || undefined,
                replyTo: replyTo || undefined,
                serverSequence,
                deliveredAt: new Date(),
              });

              let previewText = text.trim();
              if (type === 'image') previewText = '📷 Photo';
              else if (type === 'audio') previewText = '🎤 Voice message';
              else if (type === 'document') previewText = `📄 ${attachment?.fileName || 'Document'}`;

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
                  senderName: conversation.groupMeta?.name || 'Group Chat',
                  messageText: `${senderNickname}: ${previewText}`,
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

              // 2. Emit to recipient in real time
              io.to(`user:${targetReceiverId}`).emit('message:new', message);

              // 3. Dispatch FCM Push Notification
              let notifBody = text.trim();
              if (type === 'image') notifBody = '📷 Photo';
              else if (type === 'audio') notifBody = '🎤 Voice message';
              else if (type === 'document') notifBody = `📄 ${attachment?.fileName || 'Document'}`;

              sendPushNotification({
                recipientId: targetReceiverId,
                senderId: userId,
                messageId: message._id.toString(),
                senderName: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
                messageText: notifBody,
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

        const now = new Date();

        if (conv.isGroup) {
          // In Group Chat: add user to readBy array for all messages not sent by user
          await Message.updateMany(
            {
              conversationId,
              senderId: { $ne: userId },
              readBy: { $ne: userId },
            },
            {
              $addToSet: { readBy: userId },
            }
          );

          io.to(`conv:${conversationId}`).emit('message:read', {
            conversationId,
            readBy: userId,
            readAt: now,
          });
        } else {
          // In 1-to-1 Chat: update status to 'read'
          await Message.updateMany(
            {
              conversationId,
              receiverId: userId,
              status: { $in: ['sent', 'delivered'] },
            },
            {
              $set: { status: 'read', readAt: now },
            }
          );

          await Conversation.updateOne(
            { _id: conversationId, 'lastMessage.senderId': { $ne: userId } },
            { $set: { 'lastMessage.status': 'read' } }
          );

          const otherParticipantId = conv.participants.find(
            (p) => p.toString() !== userId
          );

          if (otherParticipantId) {
            io.to(`user:${otherParticipantId.toString()}`).emit('message:read', {
              conversationId,
              readBy: userId,
              readAt: now,
            });
          }
        }
      } catch (error) {
        console.error('[Socket] message:read error:', error);
      }
    });

    // Typing Indicators (Supports Direct and Group Chat Room Broadcast)
    socket.on('typing:start', (data: { conversationId: string; receiverId?: string }) => {
      if (data?.conversationId) {
        socket.to(`conv:${data.conversationId}`).emit('typing:start', {
          conversationId: data.conversationId,
          userId,
        });
      }
      if (data?.receiverId) {
        io.to(`user:${data.receiverId}`).emit('typing:start', {
          conversationId: data.conversationId,
          userId,
        });
      }
    });

    socket.on('typing:stop', (data: { conversationId: string; receiverId?: string }) => {
      if (data?.conversationId) {
        socket.to(`conv:${data.conversationId}`).emit('typing:stop', {
          conversationId: data.conversationId,
          userId,
        });
      }
      if (data?.receiverId) {
        io.to(`user:${data.receiverId}`).emit('typing:stop', {
          conversationId: data.conversationId,
          userId,
        });
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
          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen,
          });

          socket.broadcast.emit('user:offline', { userId, isOnline: false, lastSeen });
        }
      } catch (err) {
        // Ignore during teardown
      }
    });
  });
}
