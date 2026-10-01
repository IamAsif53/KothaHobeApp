import { Response } from 'express';
import dns from 'dns';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Conversation } from '../models/Conversation';
import { Message, ILinkPreview } from '../models/Message';
import { User } from '../models/User';
import { getGlobalIO } from '../sockets/socketManager';
import { sendPushNotification } from '../services/notificationService';

export const MAX_REPLY_WORDS = 50;
export const EDIT_WINDOW_MINUTES = 15;

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
          senderName: senderNickname,
          senderNickname: senderNickname,
          senderAvatar: senderUser?.avatarUrl || '',
          isGroup: true,
          groupName: conversation.groupMeta?.name || 'Group Chat',
          groupAvatar: conversation.groupMeta?.avatarUrl || '',
          messageText: trimmedText,
          messageType: 'text',
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
        senderNickname: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
        senderAvatar: senderUser?.avatarUrl || '',
        isGroup: false,
        messageText: trimmedText,
        messageType: 'text',
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

export const createMessage = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const {
      conversationId,
      receiverId,
      text = '',
      type = 'text',
      attachment,
      replyTo,
      customEmojiId,
      clientMessageId,
    } = req.body;

    if (!conversationId) {
      res.status(400).json({ success: false, message: 'Missing conversationId' });
      return;
    }

    const userId = req.user._id;
    const userIdStr = userId.toString();

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

    const cMsgId = clientMessageId || `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

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
      const customNick = nicks instanceof Map ? nicks.get(userIdStr) : (nicks as any)[userIdStr];
      if (customNick) senderNickname = customNick;
    }

    const io = getGlobalIO();

    let previewText = text.trim();
    if (type === 'image') previewText = '📷 Photo';
    else if (type === 'audio') previewText = '🎙 Voice message';
    else if (type === 'document') previewText = `📄 ${attachment?.fileName || 'Document'}`;
    else if (type === 'custom_emoji') previewText = '✨ Animated Emoji';

    if (conversation.isGroup) {
      if (conversation.groupMeta?.permissions?.sendMessages === 'admins') {
        const isCreator = conversation.groupMeta.creator?.toString() === userIdStr;
        const isAdmin = conversation.groupMeta.admins?.some((a: any) => a?.toString() === userIdStr);
        const isMod = conversation.groupMeta.moderators?.some((m: any) => m?.toString() === userIdStr);
        if (!isCreator && !isAdmin && !isMod) {
          res.status(403).json({ success: false, message: 'Only admins can send messages in this group.' });
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
        text: text.trim(),
        type,
        customEmojiId,
        status: 'delivered',
        readBy: [{ user: userId as any, readAt: new Date() }],
        clientMessageId: cMsgId,
        attachment: attachment || undefined,
        replyTo: replyTo || undefined,
        serverSequence,
        expiresAt,
        deliveredAt: new Date(),
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: {
          text: `${senderNickname}: ${previewText}`,
          senderId: userId,
          createdAt: message.createdAt,
          status: 'delivered',
        },
        lastMessageAt: message.createdAt,
      });

      if (io) {
        io.to(`conv:${conversationId}`).emit('message:new', message);
        io.to(`user:${userIdStr}`).emit('message:sent', message);
      }

      const allMemberIds = new Set<string>();
      (conversation.participants || []).forEach((p: any) => allMemberIds.add(p.toString()));
      (conversation.groupMeta?.members || []).forEach((m: any) => {
        const mId = m.user?._id?.toString() || m.user?.toString();
        if (mId && m.status === 'accepted') allMemberIds.add(mId);
      });
      allMemberIds.delete(userIdStr);

      allMemberIds.forEach((pIdStr) => {
        if (io) {
          io.to(`user:${pIdStr}`).emit('message:new', message);
        }
        sendPushNotification({
          recipientId: pIdStr,
          senderId: userIdStr,
          messageId: message._id.toString(),
          senderName: senderNickname,
          senderNickname: senderNickname,
          senderAvatar: senderUser?.avatarUrl || '',
          isGroup: true,
          groupName: conversation.groupMeta?.name || 'Group Chat',
          groupAvatar: conversation.groupMeta?.avatarUrl || '',
          messageText: text.trim(),
          messageType: type,
          attachmentFileName: attachment?.fileName,
          customEmojiId,
          conversationId: conversationId.toString(),
        }).catch(() => {});
      });

      res.status(200).json({ success: true, message });
      return;
    } else {
      // 1-on-1 direct chat
      const targetReceiverId = receiverId || conversation.participants.find((p) => p.toString() !== userIdStr)?.toString();
      if (!targetReceiverId) {
        res.status(400).json({ success: false, message: 'Recipient not found' });
        return;
      }

      const recipientSockets = io ? await io.in(`user:${targetReceiverId}`).fetchSockets() : [];
      const initialStatus: 'sent' | 'delivered' = recipientSockets.length > 0 ? 'delivered' : 'sent';

      const message = await Message.create({
        conversationId,
        senderId: userId,
        receiverId: targetReceiverId,
        text: text.trim(),
        type,
        customEmojiId,
        status: initialStatus,
        clientMessageId: cMsgId,
        attachment: attachment || undefined,
        replyTo: replyTo || undefined,
        serverSequence,
        deliveredAt: recipientSockets.length > 0 ? new Date() : undefined,
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: {
          text: previewText,
          senderId: userId,
          createdAt: message.createdAt,
          status: initialStatus,
        },
        lastMessageAt: message.createdAt,
      });

      if (io) {
        io.to(`conv:${conversationId}`).emit('message:new', message);
        io.to(`user:${targetReceiverId}`).emit('message:new', message);
        io.to(`user:${userIdStr}`).emit('message:sent', message);
      }

      sendPushNotification({
        recipientId: targetReceiverId,
        senderId: userIdStr,
        messageId: message._id.toString(),
        senderName: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
        senderNickname: senderUser?.displayName || senderUser?.username || 'Kotha Hobe',
        senderAvatar: senderUser?.avatarUrl || '',
        isGroup: false,
        messageText: text.trim(),
        messageType: type,
        attachmentFileName: attachment?.fileName,
        customEmojiId,
        conversationId: conversationId.toString(),
      }).catch(() => {});

      res.status(200).json({ success: true, message });
      return;
    }
  } catch (error) {
    console.error('[MessageController] createMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to create message' });
  }
};

export const deleteMessage = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { messageId } = req.params;
    const conversationId = (req.query.conversationId as string) || req.body?.conversationId;
    const deleteForEveryone = req.query.deleteForEveryone === 'true' || req.body?.deleteForEveryone === true;

    const userId = req.user._id.toString();

    const msg = await Message.findById(messageId);
    if (!msg) {
      res.status(200).json({ success: true, message: 'Message already removed' });
      return;
    }

    const io = getGlobalIO();

    if (deleteForEveryone && msg.senderId.toString() === userId) {
      msg.isDeletedForEveryone = true;
      msg.text = 'This message was deleted';
      msg.attachment = undefined;
      await msg.save();

      if (io && conversationId) {
        io.to(`conv:${conversationId}`).emit('message:deleted', {
          messageId,
          conversationId,
          deleteForEveryone: true,
        });
      }
    } else {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { deletedFor: req.user._id },
      });

      if (io && conversationId) {
        io.to(`user:${userId}`).emit('message:deleted', {
          messageId,
          conversationId,
          deleteForEveryone: false,
        });
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[MessageController] deleteMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete message' });
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

    const conversationId = req.body?.conversationId || req.params?.conversationId;
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
          senderId: { $ne: req.user._id },
          status: { $in: ['sending', 'sent', 'delivered'] },
        },
        {
          $set: { status: 'read', readAt: now },
          $addToSet: { readBy: { user: req.user._id, readAt: now } },
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
        io.to(`conv:${conversationId}`).emit('message:read', {
          conversationId,
          readBy: userId,
          readAt: now,
        });
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

// ==========================================
// FEATURE 1: MESSAGE EDIT (15 min window)
// ==========================================
export const editMessage = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { messageId } = req.params;
    const { text } = req.body;

    if (!messageId) {
      res.status(400).json({ success: false, message: 'Missing messageId' });
      return;
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ success: false, message: 'Text cannot be empty' });
      return;
    }

    const trimmedText = text.trim();
    if (trimmedText.length > 5000) {
      res.status(400).json({ success: false, message: 'Text exceeds maximum limit of 5000 characters' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ success: false, message: 'Message not found' });
      return;
    }

    // Sender-only validation
    if (message.senderId.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, message: 'You can only edit your own messages' });
      return;
    }

    if (message.isDeletedForEveryone) {
      res.status(400).json({ success: false, message: 'Cannot edit a deleted message' });
      return;
    }

    // Editable type check
    if (message.type !== 'text' && message.type !== 'story_reply' && message.type !== 'custom_emoji') {
      res.status(400).json({ success: false, message: 'Only text messages can be edited' });
      return;
    }

    // 15-minute time window check
    const messageAgeMs = Date.now() - new Date(message.createdAt).getTime();
    const maxAgeMs = EDIT_WINDOW_MINUTES * 60 * 1000;
    if (messageAgeMs > maxAgeMs) {
      res.status(400).json({
        success: false,
        message: `Message can only be edited within ${EDIT_WINDOW_MINUTES} minutes of sending.`,
      });
      return;
    }

    const now = new Date();
    message.text = trimmedText;
    message.editedAt = now;
    await message.save();

    // If this was the lastMessage of the conversation, update the preview
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation && conversation.lastMessage) {
      const isLatest =
        Math.abs(new Date(conversation.lastMessage.createdAt).getTime() - new Date(message.createdAt).getTime()) < 3000;
      if (isLatest) {
        let updatedPreview = trimmedText;
        if (conversation.isGroup) {
          const nick = message.senderNickname || 'Member';
          updatedPreview = `${nick}: ${trimmedText}`;
        }
        await Conversation.findByIdAndUpdate(conversation._id, {
          'lastMessage.text': updatedPreview,
        });
      }
    }

    // Emit real-time update to active conversation room & user rooms
    const io = getGlobalIO();
    if (io) {
      const payload = {
        messageId: message._id,
        conversationId: message.conversationId,
        text: message.text,
        editedAt: message.editedAt,
      };

      io.to(`conv:${message.conversationId}`).emit('message:edited', payload);

      if (conversation) {
        conversation.participants.forEach((p) => {
          io.to(`user:${p.toString()}`).emit('message:edited', payload);
        });
      }
    }

    res.status(200).json({ success: true, message });
  } catch (error) {
    console.error('[MessageController] editMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to edit message' });
  }
};

// ==========================================
// FEATURE 2: MESSAGE FORWARDING (Multi-target)
// ==========================================
export const forwardMessage = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { messageId, destinationConversationIds } = req.body;

    if (!messageId || !Array.isArray(destinationConversationIds) || destinationConversationIds.length === 0) {
      res.status(400).json({ success: false, message: 'Missing messageId or destinationConversationIds' });
      return;
    }

    if (destinationConversationIds.length > 20) {
      res.status(400).json({ success: false, message: 'Cannot forward to more than 20 conversations at once' });
      return;
    }

    // Retrieve original source message
    const sourceMsg = await Message.findById(messageId);
    if (!sourceMsg || sourceMsg.isDeletedForEveryone) {
      res.status(404).json({ success: false, message: 'Original message not found or deleted' });
      return;
    }

    const currentUserId = req.user._id;
    const currentUserIdStr = currentUserId.toString();

    // Ensure requester has access to source conversation
    const sourceConv = await Conversation.findOne({
      _id: sourceMsg.conversationId,
      $or: [
        { participants: currentUserId },
        { 'groupMeta.members.user': currentUserId },
        { 'groupMeta.creator': currentUserId },
      ],
    });

    if (!sourceConv) {
      res.status(403).json({ success: false, message: 'Access denied to original message' });
      return;
    }

    // Determine original sender name for attribution
    let originalSenderName = sourceMsg.senderNickname || '';
    if (!originalSenderName) {
      const originalUser = await User.findById(sourceMsg.senderId).select('displayName username');
      originalSenderName = originalUser?.displayName || originalUser?.username || 'User';
    }

    const senderUser = await User.findById(currentUserId).select('displayName username avatarUrl');
    const senderDisplayName = senderUser?.displayName || senderUser?.username || 'User';

    const io = getGlobalIO();
    const forwardedMessages: any[] = [];

    // Process each target conversation
    for (const destConvId of destinationConversationIds) {
      const destConv = await Conversation.findOne({
        _id: destConvId,
        $or: [
          { participants: currentUserId },
          { 'groupMeta.members.user': currentUserId },
          { 'groupMeta.creator': currentUserId },
        ],
      });

      if (!destConv) continue;

      let myNickname = senderDisplayName;
      if (destConv.isGroup && destConv.groupMeta?.nicknames) {
        const nicks = destConv.groupMeta.nicknames;
        const customNick = nicks instanceof Map ? nicks.get(currentUserIdStr) : (nicks as any)[currentUserIdStr];
        if (customNick) myNickname = customNick;
      }

      const clientMessageId = `fwd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const count = await Message.countDocuments({ conversationId: destConv._id });
      const serverSequence = count + 1;

      let targetReceiverId: string | undefined = undefined;
      if (!destConv.isGroup) {
        targetReceiverId = destConv.participants.find((p) => p.toString() !== currentUserIdStr)?.toString();
      }

      const createdMsg = await Message.create({
        conversationId: destConv._id,
        senderId: currentUserId,
        receiverId: targetReceiverId ? (targetReceiverId as any) : undefined,
        senderNickname: destConv.isGroup ? myNickname : undefined,
        text: sourceMsg.text || '',
        type: sourceMsg.type,
        customEmojiId: sourceMsg.customEmojiId,
        attachment: sourceMsg.attachment || undefined,
        forwardedFrom: {
          messageId: sourceMsg._id,
          senderName: originalSenderName,
          originalType: sourceMsg.type,
        },
        status: destConv.isGroup ? 'delivered' : 'sent',
        readBy: destConv.isGroup ? [{ user: currentUserId as any, readAt: new Date() }] : [],
        deliveredAt: destConv.isGroup ? new Date() : undefined,
        clientMessageId,
        serverSequence,
      });

      let previewText = sourceMsg.text || '';
      if (sourceMsg.type === 'image') previewText = '📷 Photo';
      else if (sourceMsg.type === 'audio') previewText = '🎤 Voice message';
      else if (sourceMsg.type === 'document') previewText = `📄 ${sourceMsg.attachment?.fileName || 'Document'}`;
      else if (sourceMsg.type === 'custom_emoji') previewText = '✨ Animated Emoji';

      await Conversation.findByIdAndUpdate(destConv._id, {
        lastMessage: {
          text: destConv.isGroup ? `${myNickname}: ${previewText}` : previewText,
          senderId: currentUserId,
          createdAt: createdMsg.createdAt,
          status: destConv.isGroup ? 'delivered' : 'sent',
        },
        lastMessageAt: createdMsg.createdAt,
      });

      forwardedMessages.push(createdMsg);

      // Realtime notification & socket delivery
      if (io) {
        io.to(`conv:${destConv._id}`).emit('message:new', createdMsg);
        if (targetReceiverId) {
          io.to(`user:${targetReceiverId}`).emit('message:new', createdMsg);
        } else if (destConv.isGroup) {
          (destConv.participants || []).forEach((pId) => {
            if (pId.toString() !== currentUserIdStr) {
              io.to(`user:${pId.toString()}`).emit('message:new', createdMsg);
            }
          });
        }
      }

      // Push notification
      if (targetReceiverId) {
        sendPushNotification({
          recipientId: targetReceiverId,
          senderId: currentUserIdStr,
          messageId: createdMsg._id.toString(),
          senderName: senderDisplayName,
          senderNickname: senderDisplayName,
          senderAvatar: (req.user as any)?.avatarUrl || '',
          isGroup: false,
          messageText: previewText || 'Forwarded a message',
          messageType: createdMsg.type || 'text',
          attachmentFileName: createdMsg.attachment?.fileName,
          conversationId: destConv._id.toString(),
        }).catch(() => {});
      } else if (destConv.isGroup) {
        (destConv.participants || []).forEach((pId) => {
          if (pId.toString() !== currentUserIdStr) {
            sendPushNotification({
              recipientId: pId.toString(),
              senderId: currentUserIdStr,
              messageId: createdMsg._id.toString(),
              senderName: myNickname,
              senderNickname: myNickname,
              senderAvatar: (req.user as any)?.avatarUrl || '',
              isGroup: true,
              groupName: destConv.groupMeta?.name || 'Group Chat',
              groupAvatar: destConv.groupMeta?.avatarUrl || '',
              messageText: previewText || 'Forwarded a message',
              messageType: createdMsg.type || 'text',
              attachmentFileName: createdMsg.attachment?.fileName,
              conversationId: destConv._id.toString(),
            }).catch(() => {});
          }
        });
      }
    }

    res.status(200).json({ success: true, forwardedMessages });
  } catch (error) {
    console.error('[MessageController] forwardMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to forward message' });
  }
};

// ==========================================
// FEATURE 4: LINK PREVIEW (SSRF-Hardened)
// ==========================================
const linkPreviewCache = new Map<string, { data: ILinkPreview; expiresAt: number }>();

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;

  // IPv4 checks
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link Local / Cloud Metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    // Broadcast / Multicast
    if (parts[0] >= 224) return true;
  }

  // IPv6 checks
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('::ffff:127.')) {
    return true;
  }

  return false;
}

export const getLinkPreview = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, message: 'Valid URL is required' });
      return;
    }

    const trimmedUrl = url.trim();

    // Check memory cache
    const cached = linkPreviewCache.get(trimmedUrl);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(200).json({ success: true, preview: cached.data });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      res.status(400).json({ success: false, message: 'Invalid URL format' });
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      res.status(400).json({ success: false, message: 'Only http and https protocols are supported' });
      return;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      res.status(400).json({ success: false, message: 'Access to internal hostnames is prohibited' });
      return;
    }

    // SSRF DNS Resolution Check
    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      for (const addr of addresses) {
        if (isPrivateIp(addr.address)) {
          res.status(400).json({ success: false, message: 'Access to private network IP is prohibited' });
          return;
        }
      }
    } catch (dnsErr) {
      res.status(400).json({ success: false, message: 'Could not resolve domain name' });
      return;
    }

    // Safe External Fetch (5 second timeout, max 2MB)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let htmlText = '';
    try {
      const fetchRes = await fetch(trimmedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php) Facebot Twitterbot/1.0 Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      clearTimeout(timeoutId);

      const contentType = fetchRes.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        // Fallback simple domain preview if not an HTML page
        const domain = hostname.replace(/^www\./, '');
        const preview: ILinkPreview = {
          url: trimmedUrl,
          domain,
        };
        linkPreviewCache.set(trimmedUrl, { data: preview, expiresAt: Date.now() + 2 * 3600 * 1000 });
        res.status(200).json({ success: true, preview });
        return;
      }

      // Stream max 1.5MB of HTML
      const reader = fetchRes.body?.getReader();
      if (reader) {
        let receivedBytes = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            if (receivedBytes > 1500000) {
              reader.cancel();
              break;
            }
          }
        }
        const totalBuffer = Buffer.concat(chunks);
        htmlText = totalBuffer.toString('utf-8');
      } else {
        htmlText = await fetchRes.text();
      }
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      // Fallback domain-only preview on fetch timeout or blocks
      const domain = hostname.replace(/^www\./, '');
      const preview: ILinkPreview = {
        url: trimmedUrl,
        domain,
      };
      res.status(200).json({ success: true, preview });
      return;
    }

    const decodeEntities = (str: string): string => {
      return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
    };

    // Extract OpenGraph / Meta tags
    const getMetaContent = (nameOrProp: string): string => {
      const regex1 = new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:)?${nameOrProp}["'][^>]+content=["']([^"']*)["']`, 'i');
      const match1 = htmlText.match(regex1);
      if (match1 && match1[1]) return decodeEntities(match1[1]);

      const regex2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:)?${nameOrProp}["']`, 'i');
      const match2 = htmlText.match(regex2);
      if (match2 && match2[1]) return decodeEntities(match2[1]);

      return '';
    };

    let title = getMetaContent('title');
    if (!title) {
      const titleMatch = htmlText.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleMatch && titleMatch[1]) title = decodeEntities(titleMatch[1]);
    }

    let description = getMetaContent('description');
    let image = getMetaContent('image');

    // Resolve relative image URLs
    if (image && !image.startsWith('http://') && !image.startsWith('https://')) {
      try {
        image = new URL(image, parsedUrl.origin).toString();
      } catch {
        image = '';
      }
    }

    const domain = hostname.replace(/^www\./, '');

    const isGenericErrorTitle = (t: string): boolean => {
      const lower = t.toLowerCase().trim();
      return (
        lower === 'error' ||
        lower === '404' ||
        lower === 'not found' ||
        lower === '404 not found' ||
        lower === 'access denied' ||
        lower === 'forbidden' ||
        lower === 'security check' ||
        lower === 'security check required' ||
        lower === 'log in to facebook' ||
        lower === 'attention required! | cloudflare'
      );
    };

    if (!title || isGenericErrorTitle(title)) {
      const pathClean = parsedUrl.pathname.replace(/^\/+|\/+$/g, '');
      if (pathClean && pathClean.length < 35 && !pathClean.includes('=')) {
        title = `${pathClean} · ${domain}`;
      } else {
        title = domain;
      }
    }

    const preview: ILinkPreview = {
      url: trimmedUrl,
      title: title ? title.slice(0, 150) : domain,
      description: description ? description.slice(0, 250) : '',
      image: image || undefined,
      domain,
    };

    // Cache for 2 hours
    linkPreviewCache.set(trimmedUrl, {
      data: preview,
      expiresAt: Date.now() + 2 * 3600 * 1000,
    });

    res.status(200).json({ success: true, preview });
  } catch (error) {
    console.error('[MessageController] getLinkPreview error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate link preview' });
  }
};

/**
 * Retrieve message context window around a specific messageId for deep linking
 * GET /api/messages/:conversationId/context/:messageId
 */
export const getMessageContext = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { conversationId, messageId } = req.params;
    if (!conversationId || !messageId) {
      res.status(400).json({ success: false, message: 'conversationId and messageId are required' });
      return;
    }

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

    const targetMsg = await Message.findOne({
      _id: messageId,
      conversationId,
      deletedFor: { $ne: req.user._id },
    });

    if (!targetMsg) {
      res.status(404).json({ success: false, message: 'Target message not found' });
      return;
    }

    // Fetch 25 messages before and including target
    const messagesBefore = await Message.find({
      conversationId,
      deletedFor: { $ne: req.user._id },
      createdAt: { $lte: targetMsg.createdAt },
    })
      .sort({ createdAt: -1 })
      .limit(25);

    // Fetch 25 messages after target
    const messagesAfter = await Message.find({
      conversationId,
      deletedFor: { $ne: req.user._id },
      createdAt: { $gt: targetMsg.createdAt },
    })
      .sort({ createdAt: 1 })
      .limit(25);

    const combined = [...messagesBefore.reverse(), ...messagesAfter];
    // Deduplicate by _id
    const map = new Map<string, any>();
    for (const m of combined) {
      map.set(m._id.toString(), m);
    }
    const chronologicalMessages = Array.from(map.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    res.status(200).json({
      success: true,
      messages: chronologicalMessages,
      targetMessageId: messageId,
    });
  } catch (error) {
    console.error('[MessageController] getMessageContext error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve message context' });
  }
};



