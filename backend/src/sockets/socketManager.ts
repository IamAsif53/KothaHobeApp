import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message, MessageStatus } from '../models/Message';
import { sendPushNotification } from '../services/notificationService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  phoneNumber?: string;
}

export function setupSocketIO(io: SocketIOServer): void {
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
      if (!decoded) {
        return next(new Error('Invalid or expired authentication token'));
      }

      socket.userId = decoded.userId;
      socket.phoneNumber = decoded.phoneNumber;
      next();
    } catch (err) {
      next(new Error('Socket authentication error'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    if (!userId) return;

    console.log(`[Socket] Connected: user ${userId} (socket ID: ${socket.id})`);

    // Join user's personal room for direct notifications
    socket.join(`user:${userId}`);

    // Update online status in database
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
    });

    // Broadcast online presence
    socket.broadcast.emit('user:online', { userId, isOnline: true });

    // Join conversation rooms requested by client
    socket.on('conversation:join', (conversationId: string) => {
      if (conversationId) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    // Leave conversation room
    socket.on('conversation:leave', (conversationId: string) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    // Real-Time Message Sending
    socket.on('message:send', async (data: {
      conversationId: string;
      receiverId: string;
      text: string;
      clientMessageId: string;
      type?: string;
    }) => {
      try {
        const { conversationId, receiverId, text, clientMessageId, type = 'text' } = data;

        if (!conversationId || !receiverId || !text || !clientMessageId) {
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

        // Idempotency check: Return existing message if retried
        let message = await Message.findOne({ clientMessageId });

        if (!message) {
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
            deliveredAt: recipientSockets.length > 0 ? new Date() : undefined,
          });

          // Update Conversation last message snippet
          await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: {
              text: text.trim(),
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

        // 3. Dispatch FCM Push Notification (arrives even if app is closed or phone is locked!)
        User.findById(userId)
          .select('displayName username')
          .then((senderUser) => {
            sendPushNotification({
              recipientId: receiverId,
              senderName: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
              messageText: text.trim(),
              conversationId,
            }).catch((err) => console.warn('[Push] Dispatch notice:', err));
          })
          .catch(() => {});

        // 3. If delivered instantly, inform sender
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
    });

    // Mark Messages as Read
    socket.on('message:read', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        const now = new Date();

        // Update unread messages sent to this user
        const result = await Message.updateMany(
          {
            conversationId,
            receiverId: userId,
            status: { $ne: 'read' },
          },
          {
            $set: { status: 'read', readAt: now },
          }
        );

        if (result.modifiedCount > 0) {
          // Find the sender user ID for this conversation
          const conv = await Conversation.findById(conversationId);
          if (conv) {
            const otherParticipantId = conv.participants.find(
              (p) => p.toString() !== userId
            );

            if (otherParticipantId) {
              // Notify sender that their messages have been read (blue ticks)
              io.to(`user:${otherParticipantId.toString()}`).emit('message:read', {
                conversationId,
                readBy: userId,
                readAt: now,
              });
            }
          }
        }
      } catch (error) {
        console.error('[Socket] message:read error:', error);
      }
    });

    // Typing Indicators (Throttled by client)
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
        // Ignored during server teardown
      }
    });
  });
}
