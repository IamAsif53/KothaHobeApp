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
      select: '_id phoneNumber displayName avatarUrl isOnline lastSeen',
    });

    if (!conversation) {
      try {
        const newConv = await Conversation.create({
          participants: [req.user._id, recipient._id],
          participantsKey,
          lastMessageAt: new Date(),
        });
        conversation = await Conversation.findById(newConv._id).populate({
          path: 'participants',
          select: '_id phoneNumber displayName avatarUrl isOnline lastSeen',
        });
      } catch (err: any) {
        // If race condition happens, query again
        if (err.code === 11000) {
          conversation = await Conversation.findOne({ participantsKey }).populate({
            path: 'participants',
            select: '_id phoneNumber displayName avatarUrl isOnline lastSeen',
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

    // Find all conversations where current user is participant
    const conversations = await Conversation.find({ participants: userId })
      .sort({ lastMessageAt: -1 })
      .populate({
        path: 'participants',
        select: '_id phoneNumber displayName avatarUrl isOnline lastSeen',
      });

    // Calculate unread count for each conversation
    const result = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          receiverId: userId,
          status: { $in: ['sending', 'sent', 'delivered'] },
        });

        // Find recipient details (the other user)
        const recipient = conv.participants.find(
          (p: any) => p._id.toString() !== userId.toString()
        );

        return {
          _id: conv._id,
          recipient,
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
          unreadCount,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        };
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
