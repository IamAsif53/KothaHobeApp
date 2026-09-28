import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { getGlobalIO } from '../sockets/socketManager';
import { sendPushNotification } from '../services/notificationService';

export const MAX_REPLY_WORDS = 50;

export const getMessages = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { conversationId } = req.params;
    const { before, limit = '40' } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 40, 1), 100);

    // Verify conversation membership
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: req.user._id },
        { 'groupMeta.members.user': req.user._id },
        { 'groupMeta.creator': req.user._id },
      ],
    });

    if (!conversation) {
      res.status(403).json({ success: false, message: 'Access denied to this conversation' });
      return;
    }

    const query: any = {
      conversationId,
      deletedFor: { $ne: req.user._id },
    };

    if (before && typeof before === 'string') {
      query.createdAt = { $lt: new Date(before) };
    }

    // Fetch messages descending (newest first)
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit);

    const hasMore = messages.length === parsedLimit;
    const oldestCursor = messages.length > 0 ? messages[messages.length - 1].createdAt.toISOString() : null;

    // Reverse for chronological top-to-bottom display
    const chronologicalMessages = [...messages].reverse();

    res.status(200).json({
      success: true,
      messages: chronologicalMessages,
      hasMore,
      oldestCursor,
    });
  } catch (error) {
    console.error('[MessageController] error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve message history' });
  }
};

export const markMessageDelivered = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { messageId } = req.body;
    if (!messageId) {
      res.status(400).json({ success: false, message: 'Missing messageId' });
      return;
    }

    const now = new Date();
    const updated = await Message.findOneAndUpdate(
      { _id: messageId, receiverId: req.user._id, status: 'sent' },
      { status: 'delivered', deliveredAt: now },
      { new: true }
    );

    res.status(200).json({ success: true, message: updated ? 'Marked delivered' : 'Already delivered/read' });
  } catch (error) {
    console.error('[MessageController] markDelivered error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark message delivered' });
  }
};

export const sendDirectReply = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { conversationId, text, clientMessageId } = req.body;
    if (!conversationId || !text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ success: false, message: 'Missing conversationId or text' });
      return;
    }

    const trimmedText = text.trim();

    // Enforce word count limit
    const words = trimmedText.split(/\s+/).filter(Boolean);
    if (words.length > MAX_REPLY_WORDS) {
      res.status(400).json({
        success: false,
        message: `Reply exceeds maximum allowed limit of ${MAX_REPLY_WORDS} words. (${words.length} words)`,
      });
      return;
    }

    const userId = req.user._id;

    // Verify conversation access
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: userId },
        { 'groupMeta.members.user': userId },
        { 'groupMeta.creator': userId },
      ],
    });

    if (!conversation) {
      res.status(403).json({ success: false, message: 'Access denied or conversation not found' });
      return;
    }

    const cMsgId = clientMessageId || `reply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Idempotency check
    const existing = await Message.findOne({ clientMessageId: cMsgId });
    if (existing) {
      res.status(200).json({ success: true, message: existing });
      return;
    }

    const count = await Message.countDocuments({ conversationId });
    const serverSequence = count + 1;

    const senderUser = await User.findById(userId).select('displayName username avatarUrl');

    let senderNickname = senderUser?.displayName || senderUser?.username || '';
    if (conversation.isGroup && conversation.groupMeta?.nicknames) {
      const nicks = conversation.groupMeta.nicknames;
      const customNick = nicks instanceof Map ? nicks.get(userId.toString()) : (nicks as any)[userId.toString()];
      if (customNick) senderNickname = customNick;
    }

    const io = getGlobalIO();

    if (conversation.isGroup) {
      // Check group permissions
      if (conversation.groupMeta?.permissions?.sendMessages === 'admins') {
        const uIdStr = userId.toString();
        const isCreator = conversation.groupMeta.creator?.toString() === uIdStr;
        const isAdmin = conversation.groupMeta.admins?.some((a: any) => a?.toString() === uIdStr);
        const isMod = conversation.groupMeta.moderators?.some((m: any) => m?.toString() === uIdStr);
        if (!isCreator && !isAdmin && !isMod) {
          res.status(403).json({ success: false, message: 'Only admins and moderators can send messages in this group.' });
          return;
        }
      }

      let expiresAt: Date | undefined = undefined;
      if (conversation.groupMeta?.disappearingMode && conversation.groupMeta.disappearingMode > 0) {
        expiresAt = new Date(Date.now() + conversation.groupMeta.disappearingMode * 1000);
      }

      const message = await Message.create({
        conversationId,
        senderId: userId,
        senderNickname,
        text: trimmedText,
        type: 'text',
        status: 'delivered',
        readBy: [{ user: userId as any, readAt: new Date() }],
        clientMessageId: cMsgId,
        serverSequence,
        expiresAt,
        deliveredAt: new Date(),
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: {
          text: `${senderNickname}: ${trimmedText}`,
          senderId: userId,
          createdAt: message.createdAt,
          status: 'delivered',
        },
        lastMessageAt: message.createdAt,
      });

      if (io) {
        io.to(`conv:${conversationId}`).emit('message:new', message);
      }

      // Push & socket emit to members
      const allMemberIds = new Set<string>();
      (conversation.participants || []).forEach((p: any) => allMemberIds.add(p.toString()));
      (conversation.groupMeta?.members || []).forEach((m: any) => {
        const mId = m.user?._id?.toString() || m.user?.toString();
        if (mId && m.status === 'accepted') allMemberIds.add(mId);
      });
      allMemberIds.delete(userId.toString());

      allMemberIds.forEach((pIdStr) => {
        if (io) {
          io.to(`user:${pIdStr}`).emit('message:new', message);
        }

        sendPushNotification({
          recipientId: pIdStr,
          senderId: userId.toString(),
          messageId: message._id.toString(),
          senderName: conversation.groupMeta?.name || 'Group Chat',
          messageText: `${senderNickname}: ${trimmedText}`,
          conversationId: conversationId.toString(),
        }).catch(() => {});
      });

      res.status(200).json({ success: true, message });
      return;
    } else {
      // 1-on-1 direct chat
      const targetReceiverId = conversation.participants.find((p) => p.toString() !== userId.toString())?.toString();
      if (!targetReceiverId) {
        res.status(400).json({ success: false, message: 'Recipient not found' });
        return;
      }

      const message = await Message.create({
        conversationId,
        senderId: userId,
        receiverId: targetReceiverId,
        text: trimmedText,
        type: 'text',
        status: 'sent',
        clientMessageId: cMsgId,
        serverSequence,
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: {
          text: trimmedText,
          senderId: userId,
          createdAt: message.createdAt,
          status: 'sent',
        },
        lastMessageAt: message.createdAt,
      });

      if (io) {
        io.to(`conv:${conversationId}`).emit('message:new', message);
        io.to(`user:${targetReceiverId}`).emit('message:new', message);
      }

      sendPushNotification({
        recipientId: targetReceiverId,
        senderId: userId.toString(),
        messageId: message._id.toString(),
        senderName: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
        messageText: trimmedText,
        conversationId: conversationId.toString(),
      }).catch(() => {});

      res.status(200).json({ success: true, message });
      return;
    }
  } catch (error) {
    console.error('[MessageController] sendDirectReply error:', error);
    res.status(500).json({ success: false, message: 'Failed to send direct reply' });
  }
};

export const markConversationAsRead = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { conversationId } = req.body;
    if (!conversationId) {
      res.status(400).json({ success: false, message: 'Missing conversationId' });
      return;
    }

    const userId = req.user._id.toString();
    const conv = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: req.user._id },
        { 'groupMeta.members.user': req.user._id },
        { 'groupMeta.creator': req.user._id },
      ],
    });

    if (!conv) {
      res.status(404).json({ success: false, message: 'Conversation not found or access denied' });
      return;
    }

    const now = new Date();
    const io = getGlobalIO();

    if (conv.isGroup) {
      await Message.updateMany(
        {
          conversationId,
          senderId: { $ne: req.user._id },
          'readBy.user': { $ne: req.user._id },
        },
        {
          $addToSet: { readBy: { user: req.user._id, readAt: now } },
        }
      );

      if (io) {
        io.to(`conv:${conversationId}`).emit('message:read', {
          conversationId,
          readBy: userId,
          readAt: now,
        });
        io.to(`user:${userId}`).emit('message:read', {
          conversationId,
          readBy: userId,
          readAt: now,
        });
      }
    } else {
      await Message.updateMany(
        {
          conversationId,
          receiverId: req.user._id,
          status: { $in: ['sent', 'delivered'] },
        },
        {
          $set: { status: 'read', readAt: now },
        }
      );

      await Conversation.updateOne(
        { _id: conversationId, 'lastMessage.senderId': { $ne: req.user._id } },
        { $set: { 'lastMessage.status': 'read' } }
      );

      const otherParticipantId = conv.participants.find(
        (p) => p.toString() !== userId
      );

      if (io) {
        if (otherParticipantId) {
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
    }

    res.status(200).json({ success: true, conversationId, readAt: now });
  } catch (error) {
    console.error('[MessageController] markConversationAsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark conversation as read' });
  }
};

