import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';

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
      participants: req.user._id,
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
