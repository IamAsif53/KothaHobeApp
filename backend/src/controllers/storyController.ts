import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Story, IStory } from '../models/Story';
import { Conversation, generateParticipantsKey } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { getGlobalIO } from '../sockets/socketManager';
import { sendPushNotification } from '../services/notificationService';

// 1. Get Stories Feed (Grouped by User for Connections + Self)
export const getStoryFeed = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const currentUserId = req.user._id;

    // 1. Find all users with whom the current user shares conversations (direct or group)
    const userConversations = await Conversation.find({
      participants: currentUserId,
      deletedFor: { $ne: currentUserId },
    }).select('participants');

    const connectedUserIdsSet = new Set<string>();
    connectedUserIdsSet.add(currentUserId.toString());

    userConversations.forEach((conv) => {
      conv.participants.forEach((pId) => {
        connectedUserIdsSet.add(pId.toString());
      });
    });

    const connectionObjectIds = Array.from(connectedUserIdsSet).map((id) => new Types.ObjectId(id));

    // 2. Fetch all active, non-expired stories for these users (or public/everyone stories)
    const now = new Date();
    const activeStories = await Story.find({
      $or: [
        { user: { $in: connectionObjectIds } },
        { privacy: 'everyone' },
      ],
      expiresAt: { $gt: now },
      isArchived: false,
    })
      .sort({ createdAt: 1 })
      .populate('user', 'displayName username avatarUrl isOnline lastSeen');

    // 3. Group stories by user
    const userStoryMap = new Map<string, { user: any; slides: any[] }>();

    activeStories.forEach((story) => {
      if (!story.user) return;
      const u = story.user as any;
      const uid = u._id.toString();

      if (!userStoryMap.has(uid)) {
        userStoryMap.set(uid, {
          user: {
            _id: u._id,
            displayName: u.displayName || u.username || 'User',
            username: u.username || '',
            avatarUrl: u.avatarUrl || '',
            isOnline: !!u.isOnline,
            lastSeen: u.lastSeen,
          },
          slides: [],
        });
      }

      const hasViewed = story.viewers.some(
        (v) => v.user?.toString() === currentUserId.toString()
      );
      const myReactionObj = story.viewers.find(
        (v) => v.user?.toString() === currentUserId.toString()
      );

      userStoryMap.get(uid)!.slides.push({
        _id: story._id,
        type: story.type,
        mediaUrl: story.mediaUrl,
        thumbnailUrl: story.thumbnailUrl,
        text: story.text,
        background: story.background,
        fontFamily: story.fontFamily,
        fontSize: story.fontSize,
        textColor: story.textColor,
        textAlign: story.textAlign,
        duration: story.duration || 6,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewsCount: story.viewers.length,
        hasViewed: hasViewed || uid === currentUserId.toString(),
        myReaction: myReactionObj?.reaction || null,
        isMe: uid === currentUserId.toString(),
      });
    });

    // 4. Format feed items with seen/unseen/partial status
    const feed = Array.from(userStoryMap.values()).map((item) => {
      const isMe = item.user._id.toString() === currentUserId.toString();
      const totalSlides = item.slides.length;
      const viewedSlides = item.slides.filter((s) => s.hasViewed).length;

      const hasUnseen = !isMe && viewedSlides < totalSlides;
      const hasPartial = !isMe && viewedSlides > 0 && viewedSlides < totalSlides;
      const isFullyViewed = isMe || viewedSlides === totalSlides;
      const lastUpdated = item.slides[item.slides.length - 1]?.createdAt || new Date();

      return {
        user: item.user,
        slides: item.slides,
        totalSlides,
        viewedSlides,
        hasUnseen,
        hasPartial,
        isFullyViewed,
        isMe,
        lastUpdated,
      };
    });

    // 5. Sort feed: Current user first -> Unseen stories -> Partial -> Fully seen (recent first)
    feed.sort((a, b) => {
      if (a.isMe) return -1;
      if (b.isMe) return 1;
      if (a.hasUnseen && !b.hasUnseen) return -1;
      if (!a.hasUnseen && b.hasUnseen) return 1;
      if (a.hasPartial && !b.hasPartial) return -1;
      if (!a.hasPartial && b.hasPartial) return 1;
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });

    res.status(200).json({
      success: true,
      feed,
    });
  } catch (error: any) {
    console.error('[Story] getStoryFeed error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stories feed' });
  }
};

// 2. Create a New Story Slide
export const createStory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const {
      type = 'text',
      mediaUrl = '',
      thumbnailUrl = '',
      text = '',
      background = 'from-emerald-600 to-teal-800',
      fontFamily = 'sans',
      fontSize = 24,
      textColor = '#ffffff',
      textAlign = 'center',
      duration = 6,
      privacy = 'connections',
    } = req.body;

    if (type === 'text' && (!text || text.trim().length === 0)) {
      res.status(400).json({ success: false, message: 'Text story cannot be empty' });
      return;
    }

    if (type === 'image' && !mediaUrl) {
      res.status(400).json({ success: false, message: 'Image story requires a photo' });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // exactly 24 hours

    const story = await Story.create({
      user: req.user._id,
      type,
      mediaUrl,
      thumbnailUrl: thumbnailUrl || mediaUrl,
      text: (text || '').trim().slice(0, 2000),
      background,
      fontFamily,
      fontSize: typeof fontSize === 'number' ? fontSize : 24,
      textColor,
      textAlign,
      duration: Math.max(3, Math.min(15, Number(duration) || 6)),
      privacy,
      viewers: [],
      isArchived: false,
      createdAt: now,
      expiresAt,
    });

    await story.populate('user', 'displayName username avatarUrl');

    console.log(`[Story] New story created by ${req.user.displayName} (${story._id})`);

    // Broadcast real-time story notification
    const io = getGlobalIO();
    if (io) {
      io.emit('story:new', {
        storyId: story._id,
        user: {
          _id: req.user._id,
          displayName: req.user.displayName,
          username: req.user.username,
          avatarUrl: req.user.avatarUrl,
        },
        story,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Story posted successfully',
      story,
    });
  } catch (error: any) {
    console.error('[Story] createStory error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to create story' });
  }
};

// 3. Mark Story Slide as Viewed
export const viewStory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const storyId = (req.params.id as string) || '';
    if (!storyId || !Types.ObjectId.isValid(storyId)) {
      res.status(400).json({ success: false, message: 'Invalid story ID' });
      return;
    }

    const currentUserId = req.user._id;
    const story = await Story.findById(storyId);

    if (!story) {
      res.status(404).json({ success: false, message: 'Story not found' });
      return;
    }

    // Do not record author viewing their own story
    if (story.user.toString() === currentUserId.toString()) {
      res.status(200).json({ success: true, message: 'Self view acknowledged' });
      return;
    }

    const alreadyViewed = story.viewers.some(
      (v) => v.user?.toString() === currentUserId.toString()
    );

    if (!alreadyViewed) {
      const viewedAt = new Date();
      story.viewers.push({
        user: currentUserId,
        viewedAt,
      });
      await story.save();

      const io = getGlobalIO();
      if (io) {
        io.to(`user:${story.user}`).emit('story:viewed', {
          storyId,
          viewer: {
            _id: currentUserId,
            displayName: req.user.displayName,
            username: req.user.username,
            avatarUrl: req.user.avatarUrl,
          },
          viewedAt,
        });
      }
    }

    res.status(200).json({ success: true, message: 'View recorded' });
  } catch (error: any) {
    console.error('[Story] viewStory error:', error);
    res.status(500).json({ success: false, message: 'Failed to record view' });
  }
};

// 4. React to Story Slide with Emoji
export const reactToStory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const storyId = (req.params.id as string) || '';
    const { emoji } = req.body;

    if (!storyId || !Types.ObjectId.isValid(storyId)) {
      res.status(400).json({ success: false, message: 'Invalid story ID' });
      return;
    }

    if (!emoji || typeof emoji !== 'string') {
      res.status(400).json({ success: false, message: 'Emoji reaction is required' });
      return;
    }

    const currentUserId = req.user._id;
    const story = await Story.findById(storyId);

    if (!story) {
      res.status(404).json({ success: false, message: 'Story not found' });
      return;
    }

    const viewerIndex = story.viewers.findIndex(
      (v) => v.user?.toString() === currentUserId.toString()
    );

    if (viewerIndex > -1) {
      story.viewers[viewerIndex].reaction = emoji;
    } else {
      story.viewers.push({
        user: currentUserId,
        viewedAt: new Date(),
        reaction: emoji,
      });
    }

    await story.save();

    // Broadcast socket event to story author
    const io = getGlobalIO();
    if (io) {
      io.to(`user:${story.user}`).emit('story:reaction', {
        storyId,
        user: {
          _id: currentUserId,
          displayName: req.user.displayName,
          username: req.user.username,
          avatarUrl: req.user.avatarUrl,
        },
        emoji,
      });
    }

    // Send push notification if reacting to someone else's story
    if (story.user.toString() !== currentUserId.toString()) {
      sendPushNotification({
        recipientId: story.user.toString(),
        senderName: req.user.displayName,
        senderNickname: req.user.displayName,
        senderAvatar: req.user.avatarUrl || '',
        isGroup: false,
        messageText: `${emoji}`,
        messageType: 'reaction',
        reactionEmoji: emoji,
        conversationId: '',
        senderId: currentUserId.toString(),
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: 'Reaction registered',
      reaction: emoji,
    });
  } catch (error: any) {
    console.error('[Story] reactToStory error:', error);
    res.status(500).json({ success: false, message: 'Failed to react to story' });
  }
};

// 5. Reply to Story -> Seamlessly Dispatches into Direct Chat
export const replyToStory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const storyId = (req.params.id as string) || '';
    const { text = '', reaction } = req.body;

    if (!storyId || !Types.ObjectId.isValid(storyId)) {
      res.status(400).json({ success: false, message: 'Invalid story ID' });
      return;
    }

    const currentUserId = req.user._id;
    const story = await Story.findById(storyId).populate('user', 'displayName username avatarUrl');

    if (!story || !story.user) {
      res.status(404).json({ success: false, message: 'Story not found or expired' });
      return;
    }

    const storyOwner = story.user as any;
    const receiverId = storyOwner._id;

    if (receiverId.toString() === currentUserId.toString()) {
      res.status(400).json({ success: false, message: 'You cannot reply to your own story' });
      return;
    }

    const replyContent = (text || reaction || 'Replied to story').trim();
    const participantsKey = generateParticipantsKey(currentUserId.toString(), receiverId.toString());

    // Find or create 1-on-1 direct conversation
    let conversation = await Conversation.findOne({ participantsKey });

    if (!conversation) {
      conversation = await Conversation.create({
        isGroup: false,
        participants: [currentUserId, receiverId],
        participantsKey,
        lastMessage: {
          text: replyContent,
          senderId: currentUserId,
          createdAt: new Date(),
          status: 'sent',
        },
        lastMessageAt: new Date(),
      });
    }

    // Prepare story context preview metadata
    const storyContext = {
      storyId: story._id,
      storyType: story.type,
      mediaUrl: story.mediaUrl,
      thumbnailUrl: story.thumbnailUrl || story.mediaUrl,
      originalText: story.text || (story.type === 'image' ? 'Photo Story' : ''),
      storyOwnerName: storyOwner.displayName || storyOwner.username || 'User',
      storyOwnerId: receiverId,
      storyCreatedAt: story.createdAt,
      reaction: reaction || undefined,
      isExpired: false,
    };

    const clientMessageId = `msg_story_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const count = await Message.countDocuments({ conversationId: conversation._id });
    const serverSequence = count + 1;

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: currentUserId,
      receiverId,
      text: replyContent,
      type: 'story_reply',
      status: 'sent',
      clientMessageId,
      storyContext,
      serverSequence,
      createdAt: new Date(),
    });

    // Update conversation lastMessage
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: replyContent,
        senderId: currentUserId,
        createdAt: message.createdAt,
        status: 'sent',
      },
      lastMessageAt: message.createdAt,
    });

    // Broadcast message via WebSockets to conversation & recipient room
    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${conversation._id}`).emit('message:new', message);
      io.to(`user:${receiverId}`).emit('message:new', message);
    }

    // Send push notification to receiver
    sendPushNotification({
      recipientId: receiverId.toString(),
      senderName: req.user.displayName,
      senderNickname: req.user.displayName,
      senderAvatar: req.user.avatarUrl || '',
      isGroup: false,
      messageText: replyContent,
      messageType: 'story_reply',
      storyContext: 'Replied to your Story',
      conversationId: conversation._id.toString(),
      senderId: currentUserId.toString(),
      messageId: message._id.toString(),
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Story reply sent to chat',
      chatMessage: message,
      conversationId: conversation._id,
    });
  } catch (error: any) {
    console.error('[Story] replyToStory error:', error);
    res.status(500).json({ success: false, message: 'Failed to send story reply' });
  }
};

// 6. Get Viewers List for a Story (Author Only)
export const getStoryViewers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const storyId = (req.params.id as string) || '';
    if (!storyId || !Types.ObjectId.isValid(storyId)) {
      res.status(400).json({ success: false, message: 'Invalid story ID' });
      return;
    }

    const story = await Story.findById(storyId).populate(
      'viewers.user',
      'displayName username avatarUrl isOnline'
    );

    if (!story) {
      res.status(404).json({ success: false, message: 'Story not found' });
      return;
    }

    if (story.user.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, message: 'Only the story author can view the viewers list' });
      return;
    }

    const viewers = story.viewers.map((v) => ({
      user: v.user,
      viewedAt: v.viewedAt,
      reaction: v.reaction || null,
    }));

    res.status(200).json({
      success: true,
      viewsCount: viewers.length,
      viewers,
    });
  } catch (error: any) {
    console.error('[Story] getStoryViewers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch viewers' });
  }
};

// 7. Delete Story Slide (Author Only)
export const deleteStory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const storyId = (req.params.id as string) || '';
    if (!storyId || !Types.ObjectId.isValid(storyId)) {
      res.status(400).json({ success: false, message: 'Invalid story ID' });
      return;
    }

    const story = await Story.findById(storyId);

    if (!story) {
      res.status(404).json({ success: false, message: 'Story not found' });
      return;
    }

    if (story.user.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, message: 'You can only delete your own stories' });
      return;
    }

    await Story.findByIdAndDelete(storyId);

    console.log(`[Story] Story ${storyId} deleted by user ${req.user._id}`);

    const io = getGlobalIO();
    if (io) {
      io.emit('story:deleted', {
        storyId,
        userId: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Story deleted successfully',
      storyId,
    });
  } catch (error: any) {
    console.error('[Story] deleteStory error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete story' });
  }
};

// 8. Get Story Archive for Current User
export const getStoryArchive = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const stories = await Story.find({
      user: req.user._id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      stories,
    });
  } catch (error: any) {
    console.error('[Story] getStoryArchive error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch story archive' });
  }
};
