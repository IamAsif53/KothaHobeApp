import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message, MessageStatus, IAttachment, IReplyTo } from '../models/Message';
import { sendPushNotification } from '../services/notificationService';
import { registerCallHandlers } from './callHandler';

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

    // Update user online status
    try {
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: new Date(),
      });

      socket.broadcast.emit('user:online', { userId, isOnline: true });
    } catch (err) {
      console.error('[Socket] Failed to update online status:', err);
    }

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

    // Send Message (Text / Image / Document / Audio)
    socket.on(
      'message:send',
      async (data: {
        conversationId: string;
        receiverId: string;
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

          if (!conversationId || !receiverId || !clientMessageId) {
            socket.emit('message:error', {
              clientMessageId,
              message: 'Missing required message parameters',
            });
            return;
          }

          // Validate conversation membership
          const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId,
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

            // Check if recipient is connected online
            const recipientSockets = await io.in(`user:${receiverId}`).fetchSockets();
            const initialStatus: MessageStatus = recipientSockets.length > 0 ? 'delivered' : 'sent';

            message = await Message.create({
              conversationId,
              senderId: userId,
              receiverId,
              text: text.trim(),
              type,
              status: initialStatus,
              clientMessageId,
              attachment: attachment || undefined,
              replyTo: replyTo || undefined,
              serverSequence,
              deliveredAt: recipientSockets.length > 0 ? new Date() : undefined,
            });

            // Format last message snippet for chat list
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
          }

          // 1. Confirm to sender with full message data
          socket.emit('message:sent', message);

          // 2. Emit to recipient in real time
          io.to(`user:${receiverId}`).emit('message:new', message);

          // 3. Dispatch FCM Push Notification (works when app is closed / screen is locked)
          User.findById(userId)
            .select('displayName username')
            .then((senderUser) => {
              let notifBody = text.trim();
              if (type === 'image') notifBody = '📷 Photo';
              else if (type === 'audio') notifBody = '🎤 Voice message';
              else if (type === 'document') notifBody = `📄 ${attachment?.fileName || 'Document'}`;

              sendPushNotification({
                recipientId: receiverId,
                senderId: userId,
                messageId: message._id.toString(),
                senderName: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
                messageText: notifBody,
                conversationId,
              }).catch((err) => console.warn('[Push] Dispatch notice:', err));
            })
            .catch(() => {});

          // 4. If delivered instantly, inform sender
          if (message.status === 'delivered') {
            socket.emit('message:delivered', {
              _id: message._id,
              clientMessageId: message.clientMessageId,
              conversationId: message.conversationId,
              deliveredAt: message.deliveredAt,
            });
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

    // Toggle Reaction on Message
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

          // Broadcast reaction update to conversation participants
          io.to(`conv:${conversationId}`).emit('message:reaction_updated', {
            messageId,
            conversationId,
            reactions: msg.reactions,
          });

          // Also inform direct recipient
          const otherId = msg.senderId.toString() === userId ? msg.receiverId.toString() : msg.senderId.toString();
          io.to(`user:${otherId}`).emit('message:reaction_updated', {
            messageId,
            conversationId,
            reactions: msg.reactions,
          });
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

            const otherId = msg.receiverId.toString();
            io.to(`user:${otherId}`).emit('message:deleted', {
              messageId,
              conversationId,
              deleteForEveryone: true,
            });
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

    // Mark Messages as Read
    socket.on('message:read', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        const now = new Date();

        const result = await Message.updateMany(
          {
            conversationId,
            receiverId: userId,
            status: { $in: ['sent', 'delivered'] },
          },
          {
            $set: { status: 'read', readAt: now },
          }
        );

        // Update Conversation.lastMessage.status to read in MongoDB
        await Conversation.updateOne(
          { _id: conversationId, 'lastMessage.senderId': { $ne: userId } },
          { $set: { 'lastMessage.status': 'read' } }
        );

        const conv = await Conversation.findById(conversationId);
        if (conv) {
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

    // Typing Indicators (Throttled)
    socket.on('typing:start', (data: { conversationId: string; receiverId: string }) => {
      if (data?.receiverId && data?.conversationId) {
        io.to(`user:${data.receiverId}`).emit('typing:start', {
          conversationId: data.conversationId,
          userId,
        });
      }
    });

    socket.on('typing:stop', (data: { conversationId: string; receiverId: string }) => {
      if (data?.receiverId && data?.conversationId) {
        io.to(`user:${data.receiverId}`).emit('typing:stop', {
          conversationId: data.conversationId,
          userId,
        });
      }
    });

    // Register 1-to-1 WebRTC Call Signaling Handlers
    registerCallHandlers(io, socket);

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
