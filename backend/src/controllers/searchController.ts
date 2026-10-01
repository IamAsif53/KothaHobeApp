import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { User, IUser } from '../models/User';
import { Conversation, IConversation } from '../models/Conversation';
import { Message, IMessage } from '../models/Message';

// Utility to escape regex special characters safely
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export interface UnifiedSearchResponse {
  success: boolean;
  query: string;
  category: string;
  counts: {
    people: number;
    groups: number;
    messages: number;
    archived: number;
    total: number;
  };
  results: {
    people: Array<{
      _id: string;
      username: string;
      displayName: string;
      avatarUrl?: string;
      isOnline: boolean;
      lastSeen: Date | null;
      conversationId: string | null;
      inContacts?: boolean;
    }>;
    groups: Array<{
      _id: string;
      name: string;
      avatarUrl?: string;
      description?: string;
      memberCount: number;
      isArchived: boolean;
      role?: string;
      lastMessageAt?: Date;
    }>;
    messages: Array<{
      _id: string;
      conversationId: string;
      senderId: string;
      senderName: string;
      senderAvatar?: string;
      text: string;
      type: string;
      attachment?: any;
      createdAt: Date;
      conversationTitle: string;
      conversationAvatar?: string;
      isGroup: boolean;
      isArchived: boolean;
    }>;
    archived: Array<{
      _id: string;
      title: string;
      avatarUrl?: string;
      isGroup: boolean;
      lastMessageText?: string;
      lastMessageAt?: Date;
    }>;
  };
}

/**
 * Unified Search Endpoint across People, Groups, Messages, and Archived
 * GET /api/search?q=query&type=all|people|groups|messages|archived&limit=15
 */
export const searchUnified = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const currentUserId = req.user._id;
    const queryParam = typeof req.query.q === 'string' ? req.query.q : '';
    const type = typeof req.query.type === 'string' ? req.query.type.toLowerCase() : 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 15, 1), 50);

    const rawQuery = queryParam.trim();
    if (!rawQuery) {
      res.status(200).json({
        success: true,
        query: '',
        category: type,
        counts: { people: 0, groups: 0, messages: 0, archived: 0, total: 0 },
        results: { people: [], groups: [], messages: [], archived: [] },
      });
      return;
    }

    const cleanQuery = rawQuery.startsWith('@') ? rawQuery.slice(1).trim() : rawQuery;
    const escapedQuery = escapeRegex(cleanQuery);
    const searchRegex = new RegExp(escapedQuery, 'i');
    const normalizedQuery = cleanQuery.toLowerCase();

    // Fetch user's active blocked list for security
    const currentUserDoc = await User.findById(currentUserId).select('blockedUsers').lean();
    const myBlockedUsers = (currentUserDoc?.blockedUsers || []).map((id: any) => id.toString());

    // 1. Fetch all conversations belonging to the user
    const userConversations = await Conversation.find({
      deletedFor: { $ne: currentUserId },
      $or: [
        { participants: currentUserId },
        { 'groupMeta.members.user': currentUserId },
        { 'groupMeta.creator': currentUserId },
      ],
    })
      .populate('participants', '_id username displayName avatarUrl isOnline lastSeen privacySettings')
      .populate('groupMeta.members.user', '_id username displayName avatarUrl')
      .lean();

    const userConvIdMap = new Map<string, any>();
    const user1on1Map = new Map<string, string>(); // otherUserId -> conversationId
    const accessibleConvIds: mongoose.Types.ObjectId[] = [];

    for (const conv of userConversations) {
      userConvIdMap.set(conv._id.toString(), conv);
      accessibleConvIds.push(conv._id);

      if (!conv.isGroup && Array.isArray(conv.participants)) {
        for (const p of conv.participants) {
          const pId = p._id ? p._id.toString() : p.toString();
          if (pId !== currentUserId.toString()) {
            user1on1Map.set(pId, conv._id.toString());
          }
        }
      }
    }

    let peopleResults: UnifiedSearchResponse['results']['people'] = [];
    let groupResults: UnifiedSearchResponse['results']['groups'] = [];
    let messageResults: UnifiedSearchResponse['results']['messages'] = [];
    let archivedResults: UnifiedSearchResponse['results']['archived'] = [];

    // =========================================================================
    // A. PEOPLE SEARCH
    // =========================================================================
    if (type === 'all' || type === 'people') {
      // Find candidate users in database matching username or display name
      const candidateUsers = await User.find({
        _id: { $ne: currentUserId, $nin: myBlockedUsers },
        blockedUsers: { $ne: currentUserId },
        $or: [
          { usernameNormalized: searchRegex },
          { username: searchRegex },
          { displayName: searchRegex },
        ],
      })
        .select('_id username usernameNormalized displayName avatarUrl isOnline lastSeen privacySettings')
        .limit(limit * 2)
        .lean();

      // Rank & Format People Results
      const formattedPeople = candidateUsers.map((u: any) => {
        const uId = u._id.toString();
        const existingConvId = user1on1Map.get(uId) || null;
        const inContacts = Boolean(existingConvId);

        // Privacy enforcement
        const isOnline =
          u.privacySettings?.onlinePresence !== false ? Boolean(u.isOnline) : false;
        let lastSeen: Date | null = u.lastSeen || null;
        if (u.privacySettings?.lastSeen === 'nobody') {
          lastSeen = null;
        } else if (u.privacySettings?.lastSeen === 'connections' && !inContacts) {
          lastSeen = null;
        }

        // Calculate relevance rank
        let score = 0;
        const uNorm = (u.usernameNormalized || u.username || '').toLowerCase();
        const dNorm = (u.displayName || '').toLowerCase();

        if (uNorm === normalizedQuery) score += 100;
        else if (uNorm.startsWith(normalizedQuery)) score += 50;
        else if (uNorm.includes(normalizedQuery)) score += 20;

        if (dNorm === normalizedQuery) score += 80;
        else if (dNorm.startsWith(normalizedQuery)) score += 40;
        else if (dNorm.includes(normalizedQuery)) score += 15;

        if (inContacts) score += 10;

        return {
          _id: uId,
          username: u.username || '',
          displayName: u.displayName || u.username || 'User',
          avatarUrl: u.avatarUrl || '',
          isOnline,
          lastSeen,
          conversationId: existingConvId,
          inContacts,
          _score: score,
        };
      });

      // Sort by score descending and take limit
      formattedPeople.sort((a, b) => b._score - a._score);
      peopleResults = formattedPeople.slice(0, limit).map(({ _score, ...p }) => p);
    }

    // =========================================================================
    // B. GROUPS SEARCH
    // =========================================================================
    if (type === 'all' || type === 'groups') {
      const matchedGroups: UnifiedSearchResponse['results']['groups'] = [];

      for (const conv of userConversations) {
        if (!conv.isGroup) continue;

        const groupName = conv.groupMeta?.name || 'Group Chat';
        const groupDesc = conv.groupMeta?.description?.text || '';
        const isArchived = Array.isArray(conv.archivedBy) &&
          conv.archivedBy.some((id: any) => id.toString() === currentUserId.toString());

        const nameMatches = searchRegex.test(groupName);
        const descMatches = searchRegex.test(groupDesc);

        if (nameMatches || descMatches) {
          // Determine current user's role in group
          let role = 'member';
          if (conv.groupMeta?.creator?.toString() === currentUserId.toString()) {
            role = 'admin';
          } else if (Array.isArray(conv.groupMeta?.admins) &&
            conv.groupMeta.admins.some((a: any) => a.toString() === currentUserId.toString())) {
            role = 'admin';
          }

          matchedGroups.push({
            _id: conv._id.toString(),
            name: groupName,
            avatarUrl: conv.groupMeta?.avatarUrl || '',
            description: groupDesc,
            memberCount: conv.groupMeta?.members?.length || conv.participants?.length || 1,
            isArchived,
            role,
            lastMessageAt: conv.lastMessageAt,
          });
        }
      }

      // Sort by exact name match first, then lastMessageAt recency
      matchedGroups.sort((a, b) => {
        const aExact = a.name.toLowerCase() === normalizedQuery;
        const bExact = b.name.toLowerCase() === normalizedQuery;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });

      groupResults = matchedGroups.slice(0, limit);
    }

    // =========================================================================
    // C. MESSAGES SEARCH
    // =========================================================================
    if (type === 'all' || type === 'messages') {
      if (accessibleConvIds.length > 0) {
        const messageQuery: any = {
          conversationId: { $in: accessibleConvIds },
          deletedFor: { $ne: currentUserId },
          isDeletedForEveryone: { $ne: true },
          $or: [
            { text: searchRegex },
            { 'attachment.fileName': searchRegex },
            { 'linkPreview.title': searchRegex },
            { 'linkPreview.url': searchRegex },
            { 'replyTo.text': searchRegex },
          ],
        };

        const matchingMessages = await Message.find(messageQuery)
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate('senderId', '_id username displayName avatarUrl')
          .lean();

        messageResults = matchingMessages.map((msg: any) => {
          const conv = userConvIdMap.get(msg.conversationId.toString());
          let conversationTitle = 'Chat';
          let conversationAvatar = '';
          let isGroup = false;
          let isArchived = false;

          if (conv) {
            isGroup = Boolean(conv.isGroup);
            isArchived = Array.isArray(conv.archivedBy) &&
              conv.archivedBy.some((id: any) => id.toString() === currentUserId.toString());

            if (isGroup) {
              conversationTitle = conv.groupMeta?.name || 'Group Chat';
              conversationAvatar = conv.groupMeta?.avatarUrl || '';
            } else if (Array.isArray(conv.participants)) {
              const other = conv.participants.find(
                (p: any) => (p._id ? p._id.toString() : p.toString()) !== currentUserId.toString()
              ) as any;
              if (other) {
                conversationTitle = other.displayName || other.username || 'User';
                conversationAvatar = other.avatarUrl || '';
              }
            }
          }

          const sender = msg.senderId as any;
          const senderName = sender?.displayName || sender?.username || (msg.senderId?.toString() === currentUserId.toString() ? 'You' : 'User');
          const senderAvatar = sender?.avatarUrl || '';

          return {
            _id: msg._id.toString(),
            conversationId: msg.conversationId.toString(),
            senderId: msg.senderId?._id ? msg.senderId._id.toString() : msg.senderId?.toString(),
            senderName,
            senderAvatar,
            text: msg.text || (msg.attachment?.fileName ? `[File] ${msg.attachment.fileName}` : ''),
            type: msg.type || 'text',
            attachment: msg.attachment,
            createdAt: msg.createdAt,
            conversationTitle,
            conversationAvatar,
            isGroup,
            isArchived,
          };
        });
      }
    }

    // =========================================================================
    // D. ARCHIVED SEARCH
    // =========================================================================
    if (type === 'all' || type === 'archived') {
      const matchedArchived: UnifiedSearchResponse['results']['archived'] = [];

      for (const conv of userConversations) {
        const isArchived = Array.isArray(conv.archivedBy) &&
          conv.archivedBy.some((id: any) => id.toString() === currentUserId.toString());

        if (!isArchived) continue;

        let title = 'Chat';
        let avatarUrl = '';
        if (conv.isGroup) {
          title = conv.groupMeta?.name || 'Group Chat';
          avatarUrl = conv.groupMeta?.avatarUrl || '';
        } else if (Array.isArray(conv.participants)) {
          const other = conv.participants.find(
            (p: any) => (p._id ? p._id.toString() : p.toString()) !== currentUserId.toString()
          ) as any;
          if (other) {
            title = other.displayName || other.username || 'User';
            avatarUrl = other.avatarUrl || '';
          }
        }

        const lastMsgText = conv.lastMessage?.text || '';
        const titleMatches = searchRegex.test(title);
        const lastMsgMatches = searchRegex.test(lastMsgText);

        if (titleMatches || lastMsgMatches) {
          matchedArchived.push({
            _id: conv._id.toString(),
            title,
            avatarUrl,
            isGroup: Boolean(conv.isGroup),
            lastMessageText: lastMsgText,
            lastMessageAt: conv.lastMessageAt,
          });
        }
      }

      archivedResults = matchedArchived.slice(0, limit);
    }

    const counts = {
      people: peopleResults.length,
      groups: groupResults.length,
      messages: messageResults.length,
      archived: archivedResults.length,
      total:
        peopleResults.length +
        groupResults.length +
        messageResults.length +
        archivedResults.length,
    };

    res.status(200).json({
      success: true,
      query: rawQuery,
      category: type,
      counts,
      results: {
        people: peopleResults,
        groups: groupResults,
        messages: messageResults,
        archived: archivedResults,
      },
    });
  } catch (error) {
    console.error('[Search] Unified search error:', error);
    res.status(500).json({ success: false, message: 'Failed to perform unified search' });
  }
};
