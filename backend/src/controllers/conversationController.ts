import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Conversation, generateParticipantsKey } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import mongoose from 'mongoose';

export const getOrCreateConversation = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { recipientId } = req.body;
    if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
      res.status(400).json({ success: false, message: 'Valid recipientId is required' });
      return;
    }

    const currentUserId = req.user._id.toString();
    if (currentUserId === recipientId.toString()) {
      res.status(400).json({ success: false, message: 'Cannot create conversation with yourself' });
      return;
    }

    // Verify recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      res.status(404).json({ success: false, message: 'Recipient user not found' });
      return;
    }

    const participantsKey = generateParticipantsKey(currentUserId, recipientId);

    // Atomically find or create
    let conversation = await Conversation.findOne({ participantsKey }).populate({
      path: 'participants',
      select: '_id phoneNumber displayName username avatarUrl isOnline lastSeen',
    });

    if (conversation) {
      // If user had previously deleted this chat, restore it cleanly for fresh communication
      if (conversation.deletedFor && conversation.deletedFor.some((id) => id.toString() === currentUserId)) {
        await Conversation.findByIdAndUpdate(conversation._id, {
          $pull: { deletedFor: req.user._id },
        });
      }
    } else {
      try {
        const newConv = await Conversation.create({
          participants: [req.user._id, recipient._id],
          participantsKey,
          lastMessageAt: new Date(),
          deletedFor: [],
        });
        conversation = await Conversation.findById(newConv._id).populate({
          path: 'participants',
          select: '_id phoneNumber displayName username avatarUrl isOnline lastSeen',
        });
      } catch (err: any) {
        // If race condition happens, query again
        if (err.code === 11000) {
          conversation = await Conversation.findOne({ participantsKey }).populate({
            path: 'participants',
            select: '_id phoneNumber displayName username avatarUrl isOnline lastSeen',
          });
        } else {
          throw err;
        }
      }
    }

    if (!conversation) {
      res.status(500).json({ success: false, message: 'Failed to create conversation' });
      return;
    }

    res.status(200).json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error('[Conversation] getOrCreate error:', error);
    res.status(500).json({ success: false, message: 'Server error creating conversation' });
  }
};

export const listConversations = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const userId = req.user._id;

    // Fetch user's blocked list
    const currentUser = await User.findById(userId).select('blockedUsers');
    const blockedUserIds = (currentUser?.blockedUsers || []).map((id) => id.toString());

    // Find all conversations where current user is participant and NOT deleted for user
    const conversations = await Conversation.find({
      participants: userId,
      deletedFor: { $ne: userId },
    })
      .sort({ lastMessageAt: -1 })
      .populate({
        path: 'participants',
        select: '_id phoneNumber displayName username avatarUrl isOnline lastSeen',
      })
      .populate('groupMeta.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.admins', '_id displayName username avatarUrl')
      .populate('groupMeta.members.user', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.members.invitedBy', '_id displayName username');

    // Filter conversations:
    // - For 1-on-1: filter out blocked users
    // - For groups: check if user is declined (filter out if declined)
    const validConversations = conversations.filter((conv) => {
      if (conv.isGroup) {
        const memberEntry = conv.groupMeta?.members?.find(
          (m: any) => m.user?._id?.toString() === userId.toString() || m.user?.toString() === userId.toString()
        );
        if (memberEntry && memberEntry.status === 'declined') {
          return false;
        }
        return true;
      }

      const recipient = conv.participants.find(
        (p: any) => p._id.toString() !== userId.toString()
      );
      if (!recipient) return false;
      return !blockedUserIds.includes(recipient._id.toString());
    });

    const result = await Promise.all(
      validConversations.map(async (conv) => {
        let unreadCount = 0;
        let myMembershipStatus: 'accepted' | 'pending' | 'declined' = 'accepted';

        if (conv.isGroup) {
          const memberEntry = conv.groupMeta?.members?.find(
            (m: any) => m.user?._id?.toString() === userId.toString() || m.user?.toString() === userId.toString()
          );
          if (memberEntry) {
            myMembershipStatus = memberEntry.status;
          }

          unreadCount = await Message.countDocuments({
            conversationId: conv._id,
            senderId: { $ne: userId },
            'readBy.user': { $ne: userId },
            type: { $ne: 'system' },
          });

          return {
            _id: conv._id,
            isGroup: true,
            groupMeta: conv.groupMeta,
            participants: conv.participants,
            myMembershipStatus,
            lastMessage: conv.lastMessage,
            lastMessageAt: conv.lastMessageAt,
            unreadCount,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
          };
        } else {
          unreadCount = await Message.countDocuments({
            conversationId: conv._id,
            receiverId: userId,
            status: { $in: ['sending', 'sent', 'delivered'] },
          });

          const recipient = conv.participants.find(
            (p: any) => p._id.toString() !== userId.toString()
          );

          return {
            _id: conv._id,
            isGroup: false,
            recipient,
            participants: conv.participants,
            lastMessage: conv.lastMessage,
            lastMessageAt: conv.lastMessageAt,
            unreadCount,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
          };
        }
      })
    );

    res.status(200).json({
      success: true,
      conversations: result,
    });
  } catch (error) {
    console.error('[Conversation] list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
};

export const getConversationDetails = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const conversationId = req.params.conversationId as string;
    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      res.status(400).json({ success: false, message: 'Invalid conversationId' });
      return;
    }

    const conv = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: req.user._id },
        { 'groupMeta.members.user': req.user._id },
        { 'groupMeta.creator': req.user._id },
      ],
    })
      .populate({
        path: 'participants',
        select: '_id phoneNumber displayName username avatarUrl isOnline lastSeen',
      })
      .populate('groupMeta.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.admins', '_id displayName username avatarUrl')
      .populate('groupMeta.members.user', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.members.invitedBy', '_id displayName username');

    if (!conv) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    let recipient = null;
    let myMembershipStatus: 'accepted' | 'pending' | 'declined' = 'accepted';

    if (conv.isGroup) {
      const memberEntry = conv.groupMeta?.members?.find(
        (m: any) => m.user?._id?.toString() === req.user!._id.toString() || m.user?.toString() === req.user!._id.toString()
      );
      if (memberEntry) {
        myMembershipStatus = memberEntry.status;
      }
    } else {
      recipient = conv.participants.find(
        (p: any) => p._id.toString() !== req.user!._id.toString()
      );
    }

    res.status(200).json({
      success: true,
      conversation: {
        _id: conv._id,
        isGroup: conv.isGroup || false,
        groupMeta: conv.groupMeta,
        participants: conv.participants,
        recipient,
        myMembershipStatus,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Conversation] get details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation details' });
  }
};

export const clearChatHistory = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const conversationId = req.params.conversationId as string;
    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      res.status(400).json({ success: false, message: 'Invalid conversationId' });
      return;
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user!._id.toString()
    );
    if (!isParticipant) {
      res.status(403).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Delete all messages in this conversation
    await Message.deleteMany({ conversationId });

    // Reset last message
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        text: '',
        status: 'sent',
        createdAt: new Date(),
      },
    });

    console.log(`[Conversation] Cleared chat history for conversation ${conversationId}`);
    res.status(200).json({ success: true, message: 'Chat history cleared successfully' });
  } catch (error) {
    console.error('[Conversation] clear history error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear chat history' });
  }
};

export const deleteConversation = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const conversationId = req.params.conversationId as string;
    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      res.status(400).json({ success: false, message: 'Invalid conversationId' });
      return;
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user!._id.toString()
    );
    if (!isParticipant) {
      res.status(403).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Mark conversation as deleted for this user
    await Conversation.findByIdAndUpdate(conversationId, {
      $addToSet: { deletedFor: req.user._id },
    });

    // Also delete all messages in this conversation for cleanliness
    await Message.deleteMany({ conversationId });

    console.log(`[Conversation] Deleted conversation ${conversationId} for user ${req.user._id}`);
    res.status(200).json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('[Conversation] delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete conversation' });
  }
};
