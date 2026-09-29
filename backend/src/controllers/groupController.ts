import { Response } from 'express';
import { Types } from 'mongoose';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Conversation, IConversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { getGlobalIO } from '../sockets/socketManager';
import { sendPushNotification } from '../services/notificationService';

export const MAX_GROUP_MEMBERS = 10;

// Helper to determine user role in a group
export function getUserGroupRole(
  group: IConversation,
  userId: string | Types.ObjectId
): 'creator' | 'admin' | 'moderator' | 'member' | null {
  if (!group || !group.groupMeta) return null;
  const uId = userId.toString();
  const creatorId =
    typeof group.groupMeta.creator === 'object' && (group.groupMeta.creator as any)._id
      ? (group.groupMeta.creator as any)._id.toString()
      : group.groupMeta.creator?.toString();

  if (creatorId === uId) return 'creator';

  const isAdmin = group.groupMeta.admins?.some(
    (a) => (typeof a === 'object' && (a as any)._id ? (a as any)._id.toString() === uId : a?.toString() === uId)
  );
  if (isAdmin) return 'admin';

  const isMod = group.groupMeta.moderators?.some(
    (m) => (typeof m === 'object' && (m as any)._id ? (m as any)._id.toString() === uId : m?.toString() === uId)
  );
  if (isMod) return 'moderator';

  const memberEntry = group.groupMeta.members?.find(
    (m) => (typeof m.user === 'object' && (m.user as any)._id ? (m.user as any)._id.toString() === uId : m.user?.toString() === uId)
  );
  if (memberEntry) {
    if (memberEntry.role === 'admin') return 'admin';
    if (memberEntry.role === 'moderator') return 'moderator';
    return 'member';
  }

  const isParticipant = group.participants?.some(
    (p) => (typeof p === 'object' && (p as any)._id ? (p as any)._id.toString() === uId : p?.toString() === uId)
  );
  return isParticipant ? 'member' : null;
}

// Helper to log administrative and membership activity
export async function logGroupActivity(
  groupId: string | Types.ObjectId,
  action: string,
  actorId: string | Types.ObjectId,
  details: string = ''
) {
  try {
    await Conversation.findByIdAndUpdate(groupId, {
      $push: {
        'groupMeta.activityLogs': {
          $each: [{ action, actor: actorId, details, createdAt: new Date() }],
          $slice: -100,
        },
      },
    });
  } catch (err) {
    console.error('[Group] logGroupActivity error:', err);
  }
}

// Helper to create and broadcast a system event message in a group
export async function createGroupSystemMessage(
  conversationId: string | Types.ObjectId,
  senderId: string | Types.ObjectId,
  text: string
) {
  try {
    const clientMessageId = `sys_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const count = await Message.countDocuments({ conversationId });
    const serverSequence = count + 1;

    const sysMsg = await Message.create({
      conversationId,
      senderId,
      text,
      type: 'system',
      status: 'delivered',
      clientMessageId,
      serverSequence,
      createdAt: new Date(),
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        text,
        senderId,
        createdAt: sysMsg.createdAt,
        status: 'delivered',
      },
      lastMessageAt: sysMsg.createdAt,
    });

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${conversationId}`).emit('message:new', sysMsg);
    }
    return sysMsg;
  } catch (err) {
    console.error('[Group] createGroupSystemMessage error:', err);
    return null;
  }
}

// 1. Create a new Group Chat (max 10 users total)
export const createGroup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { name, avatarUrl = '', memberIds = [], description = '' } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Group name is required' });
      return;
    }

    const cleanName = name.trim().slice(0, 60);
    const creatorId = req.user._id;

    // Filter and deduplicate member IDs (excluding creator)
    const validMemberIds: string[] = Array.from(
      new Set(
        (Array.isArray(memberIds) ? memberIds : [])
          .map((id) => id?.toString())
          .filter((id) => id && id !== creatorId.toString() && Types.ObjectId.isValid(id))
      )
    );

    // Enforce minimum 2 invited members (at least 3 participants total including creator)
    if (validMemberIds.length < 2) {
      res.status(400).json({
        success: false,
        message: 'A group requires at least 2 other members to be selected.',
      });
      return;
    }

    // Enforce 10 members maximum (creator + 9 invited)
    const totalCount = validMemberIds.length + 1;
    if (totalCount > MAX_GROUP_MEMBERS) {
      res.status(400).json({
        success: false,
        message: `A group can have a maximum of ${MAX_GROUP_MEMBERS} members.`,
      });
      return;
    }

    // Verify all invited users exist
    const invitedUsers = await User.find({ _id: { $in: validMemberIds } }).select('_id displayName username avatarUrl');

    const membersList = [
      {
        user: creatorId,
        role: 'admin' as const,
        status: 'accepted' as const,
        joinedAt: new Date(),
      },
      ...invitedUsers.map((u) => ({
        user: u._id,
        role: 'member' as const,
        status: 'pending' as const,
        invitedBy: creatorId,
      })),
    ];

    const allParticipantIds = [creatorId, ...invitedUsers.map((u) => u._id)];
    const inviteCode = crypto.randomBytes(8).toString('hex');

    const newGroup = await Conversation.create({
      isGroup: true,
      participants: allParticipantIds,
      participantsKey: `group_${new Types.ObjectId()}`,
      groupMeta: {
        name: cleanName,
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : '',
        description: description?.trim()
          ? { text: description.trim().slice(0, 1000), updatedAt: new Date(), updatedBy: creatorId }
          : null,
        rules: [],
        creator: creatorId,
        admins: [creatorId],
        moderators: [],
        members: membersList,
        nicknames: {},
        inviteCode,
        requiresApproval: false,
        joinRequests: [],
        pinnedMessages: [],
        disappearingMode: 0,
        notificationSettings: {},
        permissions: {
          sendMessages: 'all',
          addMembers: 'all',
          editGroupInfo: 'all',
          pinMessages: 'all',
          createPolls: 'all',
          createEvents: 'all',
        },
        events: [],
        polls: [],
        activityLogs: [
          {
            action: 'Group created',
            actor: creatorId,
            details: `Created by ${req.user.displayName || req.user.username}`,
            createdAt: new Date(),
          },
        ],
      },
      lastMessageAt: new Date(),
    });

    // Create initial system message
    const initialSystemText = `${req.user.displayName || req.user.username || 'Creator'} created the group "${cleanName}"`;
    await createGroupSystemMessage(newGroup._id, creatorId, initialSystemText);

    // Populate for response
    const populated = await Conversation.findById(newGroup._id)
      .populate('participants', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.admins', '_id displayName username avatarUrl')
      .populate('groupMeta.moderators', '_id displayName username avatarUrl')
      .populate('groupMeta.members.user', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.members.invitedBy', '_id displayName username')
      .populate('groupMeta.joinRequests.user', '_id displayName username avatarUrl')
      .populate('groupMeta.activityLogs.actor', '_id displayName username avatarUrl');

    // Real-time broadcast to invited users
    const io = getGlobalIO();
    if (io && populated) {
      allParticipantIds.forEach((pid) => {
        io.to(`user:${pid.toString()}`).emit('conversation:new', populated);
      });

      invitedUsers.forEach((u) => {
        sendPushNotification({
          recipientId: u._id.toString(),
          senderName: cleanName,
          messageText: `${req.user?.displayName || 'Someone'} invited you to join the group "${cleanName}"`,
          conversationId: newGroup._id.toString(),
          senderId: creatorId.toString(),
        }).catch(() => {});
      });
    }

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      conversation: populated,
    });
  } catch (error: any) {
    console.error('[Group] createGroup error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to create group' });
  }
};

// 2. Get full Group Details & Member info
export const getGroupDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid group ID' });
      return;
    }

    let group = await Conversation.findOne({ _id: id, isGroup: true })
      .populate('participants', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.admins', '_id displayName username avatarUrl')
      .populate('groupMeta.moderators', '_id displayName username avatarUrl')
      .populate('groupMeta.members.user', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.members.invitedBy', '_id displayName username')
      .populate('groupMeta.joinRequests.user', '_id displayName username avatarUrl')
      .populate('groupMeta.events.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.events.attendees.user', '_id displayName username avatarUrl')
      .populate('groupMeta.polls.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.activityLogs.actor', '_id displayName username avatarUrl');

    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    if (!group.groupMeta?.inviteCode) {
      const code = crypto.randomBytes(8).toString('hex');
      await Conversation.findByIdAndUpdate(id, { 'groupMeta.inviteCode': code });
      if (group.groupMeta) group.groupMeta.inviteCode = code;
    }

    const isMember = group.participants.some((p: any) => p._id.toString() === req.user!._id.toString());
    if (!isMember) {
      res.status(403).json({ success: false, message: 'You are not a member of this group' });
      return;
    }

    res.status(200).json({
      success: true,
      group,
    });
  } catch (error: any) {
    console.error('[Group] getGroupDetails error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch group details' });
  }
};

// 3. Update Group Name
export const updateGroupName = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Valid group name is required' });
      return;
    }

    const cleanName = name.trim().slice(0, 60);

    const group = await Conversation.findOne({
      _id: id,
      isGroup: true,
      participants: req.user._id,
    });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found or access denied' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const canEdit =
      role === 'creator' ||
      role === 'admin' ||
      role === 'moderator' ||
      group.groupMeta.permissions?.editGroupInfo === 'all';

    if (!canEdit) {
      res.status(403).json({ success: false, message: 'Only authorized admins can edit group info' });
      return;
    }

    const oldName = group.groupMeta.name;
    group.groupMeta.name = cleanName;
    await group.save();

    await logGroupActivity(id, 'Group name changed', req.user._id, `From "${oldName}" to "${cleanName}"`);

    const sysText = `${req.user.displayName || req.user.username || 'User'} changed the group name from "${oldName}" to "${cleanName}"`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:updated', { conversationId: id, name: cleanName });
    }

    res.status(200).json({ success: true, message: 'Group name updated', name: cleanName });
  } catch (error: any) {
    console.error('[Group] updateGroupName error:', error);
    res.status(500).json({ success: false, message: 'Failed to update group name' });
  }
};

// 4. Update Group Avatar
export const updateGroupAvatar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { avatarUrl } = req.body;

    const group = await Conversation.findOne({
      _id: id,
      isGroup: true,
      participants: req.user._id,
    });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found or access denied' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const canEdit =
      role === 'creator' ||
      role === 'admin' ||
      role === 'moderator' ||
      group.groupMeta.permissions?.editGroupInfo === 'all';

    if (!canEdit) {
      res.status(403).json({ success: false, message: 'Only authorized admins can change group icon' });
      return;
    }

    group.groupMeta.avatarUrl = typeof avatarUrl === 'string' ? avatarUrl : '';
    await group.save();

    await logGroupActivity(id, 'Group photo changed', req.user._id);

    const sysText = `${req.user.displayName || req.user.username || 'User'} updated the group icon`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:updated', { conversationId: id, avatarUrl: group.groupMeta.avatarUrl });
      io.to(`conv:${id}`).emit('group:avatar_updated', { conversationId: id, avatarUrl: group.groupMeta.avatarUrl });
    }

    res.status(200).json({ success: true, message: 'Group avatar updated', avatarUrl: group.groupMeta.avatarUrl });
  } catch (error: any) {
    console.error('[Group] updateGroupAvatar error:', error);
    res.status(500).json({ success: false, message: 'Failed to update group avatar' });
  }
};

// 5. Update Group Description & Rules
export const updateGroupDescription = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { description = '', rules = [] } = req.body;

    const group = await Conversation.findOne({
      _id: id,
      isGroup: true,
      participants: req.user._id,
    });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found or access denied' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const canEdit =
      role === 'creator' ||
      role === 'admin' ||
      role === 'moderator' ||
      group.groupMeta.permissions?.editGroupInfo === 'all';

    if (!canEdit) {
      res.status(403).json({ success: false, message: 'Only authorized admins can edit group description' });
      return;
    }

    const cleanDesc = typeof description === 'string' ? description.trim().slice(0, 1000) : '';
    const cleanRules = Array.isArray(rules)
      ? rules.map((r) => (typeof r === 'string' ? r.trim().slice(0, 200) : '')).filter(Boolean)
      : group.groupMeta.rules || [];

    group.groupMeta.description = cleanDesc
      ? { text: cleanDesc, updatedAt: new Date(), updatedBy: req.user._id }
      : (null as any);
    group.groupMeta.rules = cleanRules;

    await group.save();

    await logGroupActivity(id, 'Group description updated', req.user._id);

    const sysText = `${req.user.displayName || req.user.username} updated the group description`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:description_updated', {
        conversationId: id,
        description: group.groupMeta.description,
        rules: cleanRules,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Group description updated',
      description: group.groupMeta.description,
      rules: cleanRules,
    });
  } catch (error: any) {
    console.error('[Group] updateGroupDescription error:', error);
    res.status(500).json({ success: false, message: 'Failed to update description' });
  }
};

// 6. Get / Reset Group Invite Link
export const getInviteLink = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    let code = group.groupMeta.inviteCode;
    if (!code) {
      code = crypto.randomBytes(8).toString('hex');
      group.groupMeta.inviteCode = code;
      await group.save();
    }

    res.status(200).json({
      success: true,
      inviteCode: code,
      requiresApproval: !!group.groupMeta.requiresApproval,
    });
  } catch (error: any) {
    console.error('[Group] getInviteLink error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch invite link' });
  }
};

export const resetInviteLink = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({ _id: id, isGroup: true });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can reset the invite link' });
      return;
    }

    const newCode = crypto.randomBytes(8).toString('hex');
    group.groupMeta.inviteCode = newCode;
    await group.save();

    await logGroupActivity(id, 'Reset invite link', req.user._id);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:invite_reset', { conversationId: id, inviteCode: newCode });
    }

    res.status(200).json({
      success: true,
      message: 'Invite link reset successfully',
      inviteCode: newCode,
    });
  } catch (error: any) {
    console.error('[Group] resetInviteLink error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset invite link' });
  }
};

// 7. Preview Group by Invite Code
export const getGroupByInviteCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const inviteCode = req.params.inviteCode as string;
    if (!inviteCode) {
      res.status(400).json({ success: false, message: 'Invite code required' });
      return;
    }

    const group = await Conversation.findOne({ 'groupMeta.inviteCode': inviteCode, isGroup: true })
      .populate('groupMeta.creator', 'displayName username avatarUrl')
      .select('groupMeta participants isGroup lastMessageAt createdAt');

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Invalid or expired invite link' });
      return;
    }

    const isMember = req.user ? group.participants.some((p) => p.toString() === req.user!._id.toString()) : false;
    const isPending = req.user
      ? group.groupMeta.joinRequests?.some((r) => r.user.toString() === req.user!._id.toString())
      : false;

    res.status(200).json({
      success: true,
      group: {
        _id: group._id,
        name: group.groupMeta.name,
        avatarUrl: group.groupMeta.avatarUrl,
        description: group.groupMeta.description?.text || '',
        memberCount: group.participants.length,
        creator: group.groupMeta.creator,
        requiresApproval: !!group.groupMeta.requiresApproval,
        isMember,
        isPending,
      },
    });
  } catch (error: any) {
    console.error('[Group] getGroupByInviteCode error:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve group invite' });
  }
};

// 8. Join Group via Invite Link (or request to join if approval required)
export const joinGroupByInviteCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const inviteCode = req.params.inviteCode as string;
    const group = await Conversation.findOne({ 'groupMeta.inviteCode': inviteCode, isGroup: true });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Invalid or expired invite link' });
      return;
    }

    const userIdStr = req.user._id.toString();
    const isAlreadyMember = group.participants.some((p) => p.toString() === userIdStr);

    if (isAlreadyMember) {
      res.status(200).json({
        success: true,
        message: 'You are already a member of this group',
        conversationId: group._id,
        joined: true,
      });
      return;
    }

    if (group.groupMeta.requiresApproval) {
      const alreadyRequested = group.groupMeta.joinRequests?.some((r) => r.user.toString() === userIdStr);
      if (!alreadyRequested) {
        if (!group.groupMeta.joinRequests) group.groupMeta.joinRequests = [];
        group.groupMeta.joinRequests.push({ user: req.user._id, requestedAt: new Date() });
        await group.save();

        await logGroupActivity(group._id, 'Requested to join', req.user._id);

        const io = getGlobalIO();
        if (io) {
          group.groupMeta.admins.forEach((adminId) => {
            io.to(`user:${adminId.toString()}`).emit('group:join_requested', {
              conversationId: group._id,
              groupName: group.groupMeta!.name,
              user: {
                _id: req.user!._id,
                displayName: req.user!.displayName,
                username: req.user!.username,
                avatarUrl: req.user!.avatarUrl,
              },
            });
          });
        }

        group.groupMeta.admins.forEach((adminId) => {
          const aId = adminId.toString();
          if (aId !== req.user!._id.toString()) {
            sendPushNotification({
              recipientId: aId,
              senderName: group.groupMeta!.name,
              messageText: `${req.user!.displayName || req.user!.username} requested to join "${group.groupMeta!.name}"`,
              conversationId: group._id.toString(),
              senderId: req.user!._id.toString(),
            }).catch(() => {});
          }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Join request sent to group admins for approval',
        requested: true,
      });
      return;
    }

    if (group.participants.length >= MAX_GROUP_MEMBERS) {
      res.status(400).json({
        success: false,
        message: `Group is full (max ${MAX_GROUP_MEMBERS} members)`,
      });
      return;
    }

    group.participants.push(req.user._id as any);
    group.groupMeta.members.push({
      user: req.user._id as any,
      role: 'member',
      status: 'accepted',
      joinedAt: new Date(),
    });

    if (group.groupMeta.joinRequests) {
      group.groupMeta.joinRequests = group.groupMeta.joinRequests.filter((r) => r.user.toString() !== userIdStr);
    }

    await group.save();

    await logGroupActivity(group._id, 'Joined via invite link', req.user._id);

    const sysText = `${req.user.displayName || req.user.username} joined using the group invite link`;
    await createGroupSystemMessage(group._id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${group._id}`).emit('group:member_joined', {
        conversationId: group._id,
        user: {
          _id: req.user._id,
          displayName: req.user.displayName,
          username: req.user.username,
          avatarUrl: req.user.avatarUrl,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Joined group successfully',
      conversationId: group._id,
      joined: true,
    });
  } catch (error: any) {
    console.error('[Group] joinGroupByInviteCode error:', error);
    res.status(500).json({ success: false, message: 'Failed to join group' });
  }
};

// 9. Join Requests: Accept & Decline (Admin Only)
export const acceptJoinRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const targetUserId = req.params.targetUserId as string;

    const group = await Conversation.findOne({ _id: id, isGroup: true });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only group admins can approve join requests' });
      return;
    }

    if (group.participants.length >= MAX_GROUP_MEMBERS) {
      res.status(400).json({ success: false, message: `Group capacity full (max ${MAX_GROUP_MEMBERS} members)` });
      return;
    }

    const targetUser = await User.findById(targetUserId).select('displayName username avatarUrl');
    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (group.groupMeta.joinRequests) {
      group.groupMeta.joinRequests = group.groupMeta.joinRequests.filter(
        (r) => r.user.toString() !== targetUserId
      );
    }

    if (!group.participants.some((p) => p.toString() === targetUserId)) {
      group.participants.push(new Types.ObjectId(targetUserId));
    }

    const existingMemberIdx = group.groupMeta.members.findIndex((m) => m.user.toString() === targetUserId);
    if (existingMemberIdx >= 0) {
      group.groupMeta.members[existingMemberIdx].status = 'accepted';
      group.groupMeta.members[existingMemberIdx].joinedAt = new Date();
    } else {
      group.groupMeta.members.push({
        user: new Types.ObjectId(targetUserId),
        role: 'member',
        status: 'accepted',
        joinedAt: new Date(),
        invitedBy: req.user._id,
      });
    }

    await group.save();

    await logGroupActivity(
      id,
      'Approved join request',
      req.user._id,
      `Approved ${targetUser.displayName || targetUser.username}`
    );

    const sysText = `${req.user.displayName || req.user.username} approved ${targetUser.displayName || targetUser.username}'s join request`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`user:${targetUserId}`).emit('group:join_accepted', { conversationId: id, groupName: group.groupMeta.name });
      io.to(`conv:${id}`).emit('group:member_joined', { conversationId: id, user: targetUser });
      io.to(`conv:${id}`).emit('group:join_request_resolved', { conversationId: id, targetUserId, status: 'accepted' });
    }

    res.status(200).json({ success: true, message: 'Join request accepted' });
  } catch (error: any) {
    console.error('[Group] acceptJoinRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept join request' });
  }
};

export const declineJoinRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const targetUserId = req.params.targetUserId as string;

    const group = await Conversation.findOne({ _id: id, isGroup: true });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only group admins can decline join requests' });
      return;
    }

    if (group.groupMeta.joinRequests) {
      group.groupMeta.joinRequests = group.groupMeta.joinRequests.filter(
        (r) => r.user.toString() !== targetUserId
      );
    }

    await group.save();

    await logGroupActivity(id, 'Declined join request', req.user._id);

    const io = getGlobalIO();
    if (io) {
      io.to(`user:${targetUserId}`).emit('group:join_declined', { conversationId: id });
      io.to(`conv:${id}`).emit('group:join_request_resolved', { conversationId: id, targetUserId, status: 'declined' });
    }

    res.status(200).json({ success: true, message: 'Join request declined' });
  } catch (error: any) {
    console.error('[Group] declineJoinRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to decline join request' });
  }
};

// 10. Update Member Role (Creator / Admin / Moderator / Member)
export const updateMemberRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const targetUserId = req.params.targetUserId as string;
    const { role } = req.body;

    if (!['admin', 'moderator', 'member'].includes(role)) {
      res.status(400).json({ success: false, message: 'Invalid role specified' });
      return;
    }

    const group = await Conversation.findOne({ _id: id, isGroup: true });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const requesterRole = getUserGroupRole(group, req.user._id);
    if (requesterRole !== 'creator' && requesterRole !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can change member roles' });
      return;
    }

    const creatorIdStr = group.groupMeta.creator.toString();
    if (creatorIdStr === targetUserId) {
      res.status(400).json({ success: false, message: 'Cannot modify creator role' });
      return;
    }

    const targetUserRole = getUserGroupRole(group, targetUserId);
    if (targetUserRole === 'admin' && requesterRole !== 'creator') {
      res.status(403).json({ success: false, message: 'Only the creator can demote an admin' });
      return;
    }

    const targetUser = await User.findById(targetUserId).select('displayName username');
    const memberIndex = group.groupMeta.members.findIndex((m) => m.user.toString() === targetUserId);
    if (memberIndex === -1) {
      res.status(404).json({ success: false, message: 'Target user is not in this group' });
      return;
    }

    group.groupMeta.members[memberIndex].role = role;
    group.groupMeta.admins = group.groupMeta.admins.filter((a) => a.toString() !== targetUserId);
    if (!group.groupMeta.moderators) group.groupMeta.moderators = [];
    group.groupMeta.moderators = group.groupMeta.moderators.filter((m) => m.toString() !== targetUserId);

    if (role === 'admin') {
      group.groupMeta.admins.push(new Types.ObjectId(targetUserId));
    } else if (role === 'moderator') {
      group.groupMeta.moderators.push(new Types.ObjectId(targetUserId));
    }

    await group.save();

    const roleName = role.charAt(0).toUpperCase() + role.slice(1);
    await logGroupActivity(
      id,
      `Role changed to ${roleName}`,
      req.user._id,
      `${targetUser?.displayName || targetUser?.username || 'User'} is now a ${roleName}`
    );

    const sysText = `${req.user.displayName || req.user.username} made ${targetUser?.displayName || targetUser?.username} a ${roleName}`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:role_updated', {
        conversationId: id,
        userId: targetUserId,
        role,
      });
    }

    res.status(200).json({
      success: true,
      message: `Member role updated to ${role}`,
      role,
      targetUserId,
    });
  } catch (error: any) {
    console.error('[Group] updateMemberRole error:', error);
    res.status(500).json({ success: false, message: 'Failed to update member role' });
  }
};

// 11. Transfer Ownership (Creator Only)
export const transferOwnership = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { newCreatorId } = req.body;

    const group = await Conversation.findOne({ _id: id, isGroup: true });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    if (group.groupMeta.creator.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, message: 'Only current creator can transfer ownership' });
      return;
    }

    const newCreator = await User.findById(newCreatorId).select('displayName username');
    if (!newCreator) {
      res.status(404).json({ success: false, message: 'Target user not found' });
      return;
    }

    const isMember = group.participants.some((p) => p.toString() === newCreatorId);
    if (!isMember) {
      res.status(400).json({ success: false, message: 'New creator must be a group member' });
      return;
    }

    group.groupMeta.creator = new Types.ObjectId(newCreatorId);
    if (!group.groupMeta.admins.some((a) => a.toString() === newCreatorId)) {
      group.groupMeta.admins.push(new Types.ObjectId(newCreatorId));
    }

    await group.save();

    await logGroupActivity(
      id,
      'Transferred group ownership',
      req.user._id,
      `New creator: ${newCreator.displayName || newCreator.username}`
    );

    const sysText = `${req.user.displayName || req.user.username} transferred group ownership to ${newCreator.displayName || newCreator.username}`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:ownership_transferred', {
        conversationId: id,
        newCreatorId,
      });
    }

    res.status(200).json({ success: true, message: 'Group ownership transferred successfully' });
  } catch (error: any) {
    console.error('[Group] transferOwnership error:', error);
    res.status(500).json({ success: false, message: 'Failed to transfer ownership' });
  }
};

// 12. Pinned Messages: List, Pin, Unpin
export const getPinnedMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });

    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const pinned = await Message.find({
      conversationId: id,
      isPinned: true,
      isDeletedForEveryone: { $ne: true },
      deletedFor: { $ne: req.user._id },
    })
      .sort({ pinnedAt: -1, createdAt: -1 })
      .populate('senderId', '_id displayName username avatarUrl')
      .populate('pinnedBy', '_id displayName username');

    res.status(200).json({
      success: true,
      pinnedMessages: pinned,
    });
  } catch (error: any) {
    console.error('[Group] getPinnedMessages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pinned messages' });
  }
};

export const pinMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const messageId = req.params.messageId as string;

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const canPin =
      role === 'creator' ||
      role === 'admin' ||
      role === 'moderator' ||
      group.groupMeta.permissions?.pinMessages === 'all';

    if (!canPin) {
      res.status(403).json({ success: false, message: 'Only authorized members can pin messages' });
      return;
    }

    const message = await Message.findOne({ _id: messageId, conversationId: id });
    if (!message) {
      res.status(404).json({ success: false, message: 'Message not found' });
      return;
    }

    message.isPinned = true;
    message.pinnedBy = req.user._id;
    message.pinnedAt = new Date();
    await message.save();

    await Conversation.findByIdAndUpdate(id, {
      $addToSet: { 'groupMeta.pinnedMessages': message._id },
    });

    await logGroupActivity(id, 'Pinned a message', req.user._id, message.text?.slice(0, 40) || 'Attachment');

    const sysText = `${req.user.displayName || req.user.username} pinned a message`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:message_pinned', {
        conversationId: id,
        messageId,
        pinnedBy: req.user._id,
      });
    }

    res.status(200).json({ success: true, message: 'Message pinned successfully', messageId });
  } catch (error: any) {
    console.error('[Group] pinMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to pin message' });
  }
};

export const unpinMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const messageId = req.params.messageId as string;

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const canPin =
      role === 'creator' ||
      role === 'admin' ||
      role === 'moderator' ||
      group.groupMeta.permissions?.pinMessages === 'all';

    if (!canPin) {
      res.status(403).json({ success: false, message: 'Only authorized members can unpin messages' });
      return;
    }

    await Message.findByIdAndUpdate(messageId, {
      isPinned: false,
      pinnedBy: null,
      pinnedAt: null,
    });

    await Conversation.findByIdAndUpdate(id, {
      $pull: { 'groupMeta.pinnedMessages': messageId },
    });

    await logGroupActivity(id, 'Unpinned a message', req.user._id);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:message_unpinned', { conversationId: id, messageId });
    }

    res.status(200).json({ success: true, message: 'Message unpinned', messageId });
  } catch (error: any) {
    console.error('[Group] unpinMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to unpin message' });
  }
};

// 13. Settings: Notifications & Disappearing Messages & Permissions & Privacy
export const updateNotificationSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { preference } = req.body;

    if (!['all', 'mentions', 'muted'].includes(preference)) {
      res.status(400).json({ success: false, message: 'Invalid notification preference' });
      return;
    }

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    if (!group.groupMeta.notificationSettings) group.groupMeta.notificationSettings = {};
    (group.groupMeta.notificationSettings as any)[req.user._id.toString()] = preference;
    group.markModified('groupMeta.notificationSettings');
    await group.save();

    res.status(200).json({ success: true, message: 'Notification settings updated', preference });
  } catch (error: any) {
    console.error('[Group] updateNotificationSettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
};

export const updateDisappearingMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { duration } = req.body;

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can set disappearing messages' });
      return;
    }

    group.groupMeta.disappearingMode = Number(duration) || 0;
    await group.save();

    let desc = 'turned off';
    if (duration === 86400) desc = 'set to 24 hours';
    else if (duration === 604800) desc = 'set to 7 days';
    else if (duration === 2592000) desc = 'set to 30 days';

    await logGroupActivity(id, `Disappearing messages ${desc}`, req.user._id);

    const sysText = `${req.user.displayName || req.user.username} ${desc === 'turned off' ? 'turned off disappearing messages' : `set disappearing messages to ${desc.replace('set to ', '')}`}`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:disappearing_updated', {
        conversationId: id,
        duration: group.groupMeta.disappearingMode,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Disappearing messages setting updated',
      duration: group.groupMeta.disappearingMode,
    });
  } catch (error: any) {
    console.error('[Group] updateDisappearingMessages error:', error);
    res.status(500).json({ success: false, message: 'Failed to update disappearing messages' });
  }
};

export const updateGroupPermissions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { permissions } = req.body;

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can modify group permissions' });
      return;
    }

    group.groupMeta.permissions = {
      sendMessages: permissions?.sendMessages === 'admins' ? 'admins' : 'all',
      addMembers: permissions?.addMembers === 'admins' ? 'admins' : 'all',
      editGroupInfo: permissions?.editGroupInfo === 'admins' ? 'admins' : 'all',
      pinMessages: permissions?.pinMessages === 'admins' ? 'admins' : 'all',
      createPolls: permissions?.createPolls === 'admins' ? 'admins' : 'all',
      createEvents: permissions?.createEvents === 'admins' ? 'admins' : 'all',
    };

    if (typeof req.body.requiresApproval === 'boolean') {
      group.groupMeta.requiresApproval = req.body.requiresApproval;
    }

    await group.save();

    await logGroupActivity(id, 'Updated group permissions', req.user._id);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:permissions_updated', {
        conversationId: id,
        permissions: group.groupMeta.permissions,
        requiresApproval: group.groupMeta.requiresApproval,
      });
      io.to(`conv:${id}`).emit('group:privacy_updated', {
        conversationId: id,
        requiresApproval: group.groupMeta.requiresApproval,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Group permissions updated',
      permissions: group.groupMeta.permissions,
      requiresApproval: group.groupMeta.requiresApproval,
    });
  } catch (error: any) {
    console.error('[Group] updateGroupPermissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to update permissions' });
  }
};

export const updateGroupPrivacy = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { requiresApproval } = req.body;

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can modify group privacy' });
      return;
    }

    group.groupMeta.requiresApproval = Boolean(requiresApproval);
    await group.save();

    await logGroupActivity(
      id,
      `Join approval ${group.groupMeta.requiresApproval ? 'enabled' : 'disabled'}`,
      req.user._id
    );

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:privacy_updated', {
        conversationId: id,
        requiresApproval: group.groupMeta.requiresApproval,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Group privacy updated',
      requiresApproval: group.groupMeta.requiresApproval,
    });
  } catch (error: any) {
    console.error('[Group] updateGroupPrivacy error:', error);
    res.status(500).json({ success: false, message: 'Failed to update group privacy' });
  }
};

// 14. Social: Events & Polls
export const getGroupEvents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id })
      .populate('groupMeta.events.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.events.attendees.user', '_id displayName username avatarUrl');

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    res.status(200).json({
      success: true,
      events: group.groupMeta.events || [],
    });
  } catch (error: any) {
    console.error('[Group] getGroupEvents error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch events' });
  }
};

export const createGroupEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { title, description = '', date, time, location = '' } = req.body;

    if (!title || !date || !time) {
      res.status(400).json({ success: false, message: 'Title, date, and time are required' });
      return;
    }

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const canCreate =
      role === 'creator' ||
      role === 'admin' ||
      role === 'moderator' ||
      group.groupMeta.permissions?.createEvents === 'all';

    if (!canCreate) {
      res.status(403).json({ success: false, message: 'Only authorized members can create events' });
      return;
    }

    if (!group.groupMeta.events) group.groupMeta.events = [];

    const newEvent = {
      _id: new Types.ObjectId(),
      title: title.trim().slice(0, 100),
      description: description.trim().slice(0, 500),
      date,
      time,
      location: location.trim().slice(0, 150),
      creator: req.user._id,
      attendees: [{ user: req.user._id, status: 'going' as const }],
      createdAt: new Date(),
    };

    group.groupMeta.events.push(newEvent as any);
    await group.save();

    await logGroupActivity(id, 'Created an event', req.user._id, newEvent.title);

    const sysText = `📅 ${req.user.displayName || req.user.username} created event "${newEvent.title}" for ${date} at ${time}`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:event_created', { conversationId: id, event: newEvent });
    }

    res.status(201).json({ success: true, message: 'Event created', event: newEvent });
  } catch (error: any) {
    console.error('[Group] createGroupEvent error:', error);
    res.status(500).json({ success: false, message: 'Failed to create event' });
  }
};

export const rsvpGroupEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const eventId = req.params.eventId as string;
    const { status } = req.body;

    if (!['going', 'maybe', 'not_going'].includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid RSVP status' });
      return;
    }

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta || !group.groupMeta.events) {
      res.status(404).json({ success: false, message: 'Event or group not found' });
      return;
    }

    const event = group.groupMeta.events.find((e: any) => e._id.toString() === eventId);
    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found' });
      return;
    }

    const existingAttendee = event.attendees.find((a: any) => a.user.toString() === req.user!._id.toString());
    if (existingAttendee) {
      existingAttendee.status = status;
    } else {
      event.attendees.push({ user: req.user._id, status });
    }

    await group.save();

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:event_updated', {
        conversationId: id,
        eventId,
        userId: req.user._id,
        status,
      });
    }

    res.status(200).json({ success: true, message: 'RSVP updated', status });
  } catch (error: any) {
    console.error('[Group] rsvpGroupEvent error:', error);
    res.status(500).json({ success: false, message: 'Failed to update RSVP' });
  }
};

export const deleteGroupEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const eventId = req.params.eventId as string;

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta || !group.groupMeta.events) {
      res.status(404).json({ success: false, message: 'Event or group not found' });
      return;
    }

    const event = group.groupMeta.events.find((e: any) => e._id.toString() === eventId);
    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const isEventCreator = event.creator.toString() === req.user._id.toString();

    if (!isEventCreator && role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only event creator or group admins can delete this event' });
      return;
    }

    group.groupMeta.events = group.groupMeta.events.filter((e: any) => e._id.toString() !== eventId);
    await group.save();

    await logGroupActivity(id, 'Deleted an event', req.user._id, event.title);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:event_deleted', { conversationId: id, eventId });
    }

    res.status(200).json({ success: true, message: 'Event deleted' });
  } catch (error: any) {
    console.error('[Group] deleteGroupEvent error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete event' });
  }
};

// Polls: List, Create, Vote, Close
export const getGroupPolls = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id })
      .populate('groupMeta.polls.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.polls.options.voters', '_id displayName username avatarUrl');

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    res.status(200).json({
      success: true,
      polls: group.groupMeta.polls || [],
    });
  } catch (error: any) {
    console.error('[Group] getGroupPolls error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch polls' });
  }
};

export const createGroupPoll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { question, options = [] } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Poll question is required' });
      return;
    }

    const validOptions = (Array.isArray(options) ? options : [])
      .map((opt) => (typeof opt === 'string' ? opt.trim().slice(0, 100) : ''))
      .filter(Boolean);

    if (validOptions.length < 2) {
      res.status(400).json({ success: false, message: 'At least 2 poll options required' });
      return;
    }

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const canCreate =
      role === 'creator' ||
      role === 'admin' ||
      role === 'moderator' ||
      group.groupMeta.permissions?.createPolls === 'all';

    if (!canCreate) {
      res.status(403).json({ success: false, message: 'Only authorized members can create polls' });
      return;
    }

    if (!group.groupMeta.polls) group.groupMeta.polls = [];

    const newPoll = {
      _id: new Types.ObjectId(),
      question: question.trim().slice(0, 300),
      options: validOptions.map((text) => ({ text, voters: [] })),
      creator: req.user._id,
      isClosed: false,
      createdAt: new Date(),
    };

    group.groupMeta.polls.push(newPoll as any);
    await group.save();

    await logGroupActivity(id, 'Created a poll', req.user._id, newPoll.question);

    const sysText = `📊 ${req.user.displayName || req.user.username} created a poll: "${newPoll.question}"`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:poll_created', { conversationId: id, poll: newPoll });
    }

    res.status(201).json({ success: true, message: 'Poll created', poll: newPoll });
  } catch (error: any) {
    console.error('[Group] createGroupPoll error:', error);
    res.status(500).json({ success: false, message: 'Failed to create poll' });
  }
};

export const voteGroupPoll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const pollId = req.params.pollId as string;
    const { optionIndex } = req.body;

    if (typeof optionIndex !== 'number' || optionIndex < 0) {
      res.status(400).json({ success: false, message: 'Valid optionIndex required' });
      return;
    }

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta || !group.groupMeta.polls) {
      res.status(404).json({ success: false, message: 'Group or poll not found' });
      return;
    }

    const poll = group.groupMeta.polls.find((p: any) => p._id.toString() === pollId);
    if (!poll) {
      res.status(404).json({ success: false, message: 'Poll not found' });
      return;
    }

    if (poll.isClosed) {
      res.status(400).json({ success: false, message: 'This poll is closed' });
      return;
    }

    if (optionIndex >= poll.options.length) {
      res.status(400).json({ success: false, message: 'Invalid option index' });
      return;
    }

    const uIdStr = req.user._id.toString();

    poll.options.forEach((opt: any, idx: number) => {
      if (idx === optionIndex) {
        const hasVoted = opt.voters.some((v: any) => v.toString() === uIdStr);
        if (hasVoted) {
          opt.voters = opt.voters.filter((v: any) => v.toString() !== uIdStr);
        } else {
          opt.voters.push(req.user!._id);
        }
      } else {
        opt.voters = opt.voters.filter((v: any) => v.toString() !== uIdStr);
      }
    });

    await group.save();

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:poll_updated', {
        conversationId: id,
        pollId,
        poll,
      });
    }

    res.status(200).json({ success: true, message: 'Vote recorded', poll });
  } catch (error: any) {
    console.error('[Group] voteGroupPoll error:', error);
    res.status(500).json({ success: false, message: 'Failed to record vote' });
  }
};

export const closeGroupPoll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const pollId = req.params.pollId as string;

    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id });
    if (!group || !group.groupMeta || !group.groupMeta.polls) {
      res.status(404).json({ success: false, message: 'Group or poll not found' });
      return;
    }

    const poll = group.groupMeta.polls.find((p: any) => p._id.toString() === pollId);
    if (!poll) {
      res.status(404).json({ success: false, message: 'Poll not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const isPollCreator = poll.creator.toString() === req.user._id.toString();

    if (!isPollCreator && role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only poll creator or group admins can close this poll' });
      return;
    }

    poll.isClosed = true;
    await group.save();

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:poll_closed', { conversationId: id, pollId });
    }

    res.status(200).json({ success: true, message: 'Poll closed' });
  } catch (error: any) {
    console.error('[Group] closeGroupPoll error:', error);
    res.status(500).json({ success: false, message: 'Failed to close poll' });
  }
};

// 15. Admin Activity Logs (Admins & Moderators Only)
export const getAdminActivityLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({ _id: id, isGroup: true, participants: req.user._id })
      .populate('groupMeta.activityLogs.actor', '_id displayName username avatarUrl')
      .select('groupMeta.activityLogs groupMeta.creator groupMeta.admins groupMeta.moderators');

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin' && role !== 'moderator') {
      res.status(403).json({ success: false, message: 'Only admins and moderators can view the activity log' });
      return;
    }

    const logs = [...(group.groupMeta.activityLogs || [])].reverse();

    res.status(200).json({
      success: true,
      activityLogs: logs,
    });
  } catch (error: any) {
    console.error('[Group] getAdminActivityLogs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
  }
};

// 16. Invite Members (max 10 total)
export const inviteMembers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { memberIds = [] } = req.body;

    const group = await Conversation.findOne({
      _id: id,
      isGroup: true,
      participants: req.user._id,
    });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    const canAdd =
      role === 'creator' ||
      role === 'admin' ||
      role === 'moderator' ||
      group.groupMeta.permissions?.addMembers === 'all';

    if (!canAdd) {
      res.status(403).json({ success: false, message: 'Only authorized members can add new people' });
      return;
    }

    const existingParticipantIds = group.participants.map((p) => p.toString());

    const newMemberIds = Array.from(
      new Set(
        (Array.isArray(memberIds) ? memberIds : [])
          .map((m) => m?.toString())
          .filter((m) => m && Types.ObjectId.isValid(m) && !existingParticipantIds.includes(m))
      )
    );

    if (newMemberIds.length === 0) {
      res.status(400).json({ success: false, message: 'No new members to invite' });
      return;
    }

    if (existingParticipantIds.length + newMemberIds.length > MAX_GROUP_MEMBERS) {
      res.status(400).json({
        success: false,
        message: `Group capacity exceeded. A group can have at most ${MAX_GROUP_MEMBERS} members (currently ${existingParticipantIds.length}).`,
      });
      return;
    }

    const newUsers = await User.find({ _id: { $in: newMemberIds } }).select('_id displayName username');

    const isInviterAdmin = role === 'creator' || role === 'admin';
    if (group.groupMeta.requiresApproval && !isInviterAdmin) {
      if (!group.groupMeta.joinRequests) group.groupMeta.joinRequests = [];
      newUsers.forEach((u) => {
        const alreadyInReq = group.groupMeta!.joinRequests!.some(
          (r) => r.user.toString() === u._id.toString()
        );
        if (!alreadyInReq) {
          group.groupMeta!.joinRequests!.push({
            user: u._id,
            requestedAt: new Date(),
          });
        }
      });

      await group.save();

      const invitedNames = newUsers.map((u) => u.displayName || u.username).join(', ');
      await logGroupActivity(id, 'Invite requests pending approval', req.user._id, invitedNames);

      const io = getGlobalIO();
      if (io) {
        group.groupMeta.admins.forEach((adminId) => {
          io.to(`user:${adminId.toString()}`).emit('group:join_requested', {
            conversationId: id,
            groupName: group.groupMeta!.name,
            inviterName: req.user!.displayName || req.user!.username,
          });
        });
      }

      group.groupMeta.admins.forEach((adminId) => {
        const aId = adminId.toString();
        if (aId !== req.user!._id.toString()) {
          sendPushNotification({
            recipientId: aId,
            senderName: group.groupMeta!.name,
            messageText: `${req.user!.displayName || req.user!.username} invited ${invitedNames} (approval required)`,
            conversationId: id,
            senderId: req.user!._id.toString(),
          }).catch(() => {});
        }
      });

      res.status(200).json({
        success: true,
        message: 'Invitations submitted to admins for approval',
        requiresApproval: true,
      });
      return;
    }

    newUsers.forEach((u) => {
      group.participants.push(u._id as any);
      group.groupMeta!.members.push({
        user: u._id as any,
        role: 'member',
        status: 'pending',
        invitedBy: req.user!._id as any,
      });
    });

    await group.save();

    const invitedNames = newUsers.map((u) => u.displayName || u.username).join(', ');
    await logGroupActivity(id, 'Invited members', req.user._id, invitedNames);

    const sysText = `${req.user.displayName || req.user.username} invited ${invitedNames} to the group`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const populated = await Conversation.findById(id)
      .populate('participants', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.admins', '_id displayName username avatarUrl')
      .populate('groupMeta.moderators', '_id displayName username avatarUrl')
      .populate('groupMeta.members.user', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.members.invitedBy', '_id displayName username');

    const io = getGlobalIO();
    if (io && populated) {
      newUsers.forEach((u) => {
        io.to(`user:${u._id.toString()}`).emit('conversation:new', populated);
        sendPushNotification({
          recipientId: u._id.toString(),
          senderName: group.groupMeta!.name,
          messageText: `${req.user?.displayName || 'Someone'} invited you to join "${group.groupMeta!.name}"`,
          conversationId: id,
          senderId: req.user!._id.toString(),
        }).catch(() => {});
      });

      io.to(`conv:${id}`).emit('group:updated', { conversationId: id, group: populated });
    }

    res.status(200).json({ success: true, message: 'Members invited successfully', group: populated });
  } catch (error: any) {
    console.error('[Group] inviteMembers error:', error);
    res.status(500).json({ success: false, message: 'Failed to invite members' });
  }
};

// 17. Accept Group Invitation
export const acceptGroupInvite = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({ _id: id, isGroup: true });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const memberEntry = group.groupMeta.members.find(
      (m) => m.user.toString() === req.user!._id.toString()
    );

    if (!memberEntry) {
      res.status(403).json({ success: false, message: 'You have not been invited to this group' });
      return;
    }

    memberEntry.status = 'accepted';
    memberEntry.joinedAt = new Date();

    if (!group.participants.some((p) => p.toString() === req.user!._id.toString())) {
      group.participants.push(req.user._id as any);
    }

    await group.save();

    await logGroupActivity(id, 'Accepted invite & joined', req.user._id);

    const sysText = `${req.user.displayName || req.user.username || 'User'} accepted the invite and joined the group`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:member_joined', {
        conversationId: id,
        user: {
          _id: req.user._id,
          displayName: req.user.displayName,
          username: req.user.username,
          avatarUrl: req.user.avatarUrl,
        },
      });
    }

    res.status(200).json({ success: true, message: 'Joined group successfully', conversationId: id });
  } catch (error: any) {
    console.error('[Group] acceptGroupInvite error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept group invite' });
  }
};

// 18. Decline Group Invitation
export const declineGroupInvite = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({ _id: id, isGroup: true });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    group.participants = group.participants.filter(
      (p) => p.toString() !== req.user!._id.toString()
    );

    const memberEntry = group.groupMeta.members.find(
      (m) => m.user.toString() === req.user!._id.toString()
    );
    if (memberEntry) {
      memberEntry.status = 'declined';
    }

    await group.save();

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:member_declined', {
        conversationId: id,
        userId: req.user._id,
      });
    }

    res.status(200).json({ success: true, message: 'Group invite declined' });
  } catch (error: any) {
    console.error('[Group] declineGroupInvite error:', error);
    res.status(500).json({ success: false, message: 'Failed to decline group invite' });
  }
};

// 19. Leave Group (with creator protection)
export const leaveGroup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const group = await Conversation.findOne({
      _id: id,
      isGroup: true,
      participants: req.user._id,
    });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found or you are not a member' });
      return;
    }

    const userIdStr = req.user._id.toString();
    const isCreator = group.groupMeta.creator.toString() === userIdStr;
    const remainingAccepted = group.groupMeta.members.filter(
      (m) => m.user.toString() !== userIdStr && m.status === 'accepted'
    );

    if (isCreator && remainingAccepted.length > 0) {
      const nextAdmin = group.groupMeta.admins.find((a) => a.toString() !== userIdStr);
      const newCreatorId = nextAdmin ? nextAdmin.toString() : remainingAccepted[0].user.toString();
      group.groupMeta.creator = new Types.ObjectId(newCreatorId);
      if (!group.groupMeta.admins.some((a) => a.toString() === newCreatorId)) {
        group.groupMeta.admins.push(new Types.ObjectId(newCreatorId));
      }
    }

    group.participants = group.participants.filter((p) => p.toString() !== userIdStr);
    group.groupMeta.members = group.groupMeta.members.filter((m) => m.user.toString() !== userIdStr);
    group.groupMeta.admins = group.groupMeta.admins.filter((a) => a.toString() !== userIdStr);
    if (group.groupMeta.moderators) {
      group.groupMeta.moderators = group.groupMeta.moderators.filter((m) => m.toString() !== userIdStr);
    }

    await group.save();

    await logGroupActivity(id, 'Left the group', req.user._id);

    const sysText = `${req.user.displayName || req.user.username || 'User'} left the group`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:member_left', {
        conversationId: id,
        userId: req.user._id,
      });
    }

    res.status(200).json({ success: true, message: 'Left group successfully' });
  } catch (error: any) {
    console.error('[Group] leaveGroup error:', error);
    res.status(500).json({ success: false, message: 'Failed to leave group' });
  }
};

// 20. Remove Member (Admin / Creator Only)
export const removeMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const targetUserId = req.params.targetUserId as string;

    const group = await Conversation.findOne({ _id: id, isGroup: true });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only group admins can remove members' });
      return;
    }

    if (group.groupMeta.creator.toString() === targetUserId) {
      res.status(400).json({ success: false, message: 'Cannot remove the group creator' });
      return;
    }

    const targetUserRole = getUserGroupRole(group, targetUserId);
    if (targetUserRole === 'admin' && role !== 'creator') {
      res.status(403).json({ success: false, message: 'Only the creator can remove an admin' });
      return;
    }

    const targetUser = await User.findById(targetUserId).select('displayName username');

    group.participants = group.participants.filter((p) => p.toString() !== targetUserId);
    group.groupMeta.members = group.groupMeta.members.filter((m) => m.user.toString() !== targetUserId);
    group.groupMeta.admins = group.groupMeta.admins.filter((a) => a.toString() !== targetUserId);
    if (group.groupMeta.moderators) {
      group.groupMeta.moderators = group.groupMeta.moderators.filter((m) => m.toString() !== targetUserId);
    }

    await group.save();

    await logGroupActivity(
      id,
      'Removed member',
      req.user._id,
      `Removed ${targetUser?.displayName || targetUser?.username || 'User'}`
    );

    const sysText = `${req.user.displayName || req.user.username} removed ${targetUser?.displayName || 'User'} from the group`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`user:${targetUserId}`).emit('group:removed', { conversationId: id });
      io.to(`conv:${id}`).emit('group:member_removed', { conversationId: id, userId: targetUserId });
    }

    res.status(200).json({ success: true, message: 'Member removed successfully' });
  } catch (error: any) {
    console.error('[Group] removeMember error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove member' });
  }
};

// 21. Toggle Member Admin Status (Legacy Support)
export const toggleAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const targetUserId = req.params.targetUserId as string;

    const group = await Conversation.findOne({ _id: id, isGroup: true });
    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only group admins can manage admin roles' });
      return;
    }

    const targetIndex = group.groupMeta.members.findIndex((m) => m.user.toString() === targetUserId);
    if (targetIndex === -1) {
      res.status(404).json({ success: false, message: 'Target user is not in this group' });
      return;
    }

    const targetUser = await User.findById(targetUserId).select('displayName username');
    const isCurrentlyAdmin = group.groupMeta.admins.some((a) => a.toString() === targetUserId);

    let sysText = '';
    if (isCurrentlyAdmin) {
      if (group.groupMeta.creator.toString() === targetUserId) {
        res.status(400).json({ success: false, message: 'Cannot demote the group creator' });
        return;
      }
      group.groupMeta.admins = group.groupMeta.admins.filter((a) => a.toString() !== targetUserId);
      group.groupMeta.members[targetIndex].role = 'member';
      sysText = `${req.user.displayName || req.user.username} dismissed ${targetUser?.displayName || 'User'} as admin`;
    } else {
      group.groupMeta.admins.push(new Types.ObjectId(targetUserId));
      group.groupMeta.members[targetIndex].role = 'admin';
      sysText = `${req.user.displayName || req.user.username} made ${targetUser?.displayName || 'User'} a group admin`;
    }

    await group.save();
    await logGroupActivity(id, isCurrentlyAdmin ? 'Demoted admin' : 'Promoted to admin', req.user._id, targetUser?.displayName);
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:admin_toggled', {
        conversationId: id,
        userId: targetUserId,
        isAdmin: !isCurrentlyAdmin,
      });
    }

    res.status(200).json({
      success: true,
      message: isCurrentlyAdmin ? 'Admin status removed' : 'Member promoted to admin',
      isAdmin: !isCurrentlyAdmin,
    });
  } catch (error: any) {
    console.error('[Group] toggleAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to update admin status' });
  }
};

// 22. Set Custom Group Nickname
export const setGroupNickname = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { targetUserId, nickname } = req.body;

    if (!targetUserId || !Types.ObjectId.isValid(targetUserId)) {
      res.status(400).json({ success: false, message: 'Valid targetUserId is required' });
      return;
    }

    const group = await Conversation.findOne({
      _id: id,
      isGroup: true,
      participants: req.user._id,
    });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found or access denied' });
      return;
    }

    const isTargetInGroup = group.participants.some((p) => p.toString() === targetUserId);
    if (!isTargetInGroup) {
      res.status(404).json({ success: false, message: 'Target user is not a member of this group' });
      return;
    }

    const targetUser = await User.findById(targetUserId).select('displayName username');
    const cleanNickname = typeof nickname === 'string' ? nickname.trim().slice(0, 50) : '';

    const currentNicknames = (group.groupMeta.nicknames as any) || {};
    const nickObj: Record<string, string> =
      currentNicknames instanceof Map
        ? Object.fromEntries(currentNicknames.entries())
        : typeof currentNicknames === 'object'
        ? { ...currentNicknames }
        : {};

    if (cleanNickname) {
      nickObj[targetUserId] = cleanNickname;
    } else {
      delete nickObj[targetUserId];
    }

    group.groupMeta.nicknames = nickObj;
    group.markModified('groupMeta.nicknames');
    await group.save();

    const targetName = targetUser?.displayName || targetUser?.username || 'User';
    const sysText = cleanNickname
      ? `${req.user.displayName || req.user.username} set nickname for ${targetName} to "${cleanNickname}"`
      : `${req.user.displayName || req.user.username} cleared nickname for ${targetName}`;

    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:nickname_updated', {
        conversationId: id,
        userId: targetUserId,
        nickname: cleanNickname || null,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Nickname updated successfully',
      targetUserId,
      nickname: cleanNickname || null,
    });
  } catch (error: any) {
    console.error('[Group] setGroupNickname error:', error);
    res.status(500).json({ success: false, message: 'Failed to set nickname' });
  }
};

// 23. Delete Group (Admin / Creator Only)
export const deleteGroup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid group ID' });
      return;
    }

    const group = await Conversation.findOne({
      _id: id,
      isGroup: true,
    });

    if (!group || !group.groupMeta) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const role = getUserGroupRole(group, req.user._id);
    if (role !== 'creator' && role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only group admins can remove this group' });
      return;
    }

    const participantIds = group.participants.map((p) => p.toString());

    await Message.deleteMany({ conversationId: id });
    await Conversation.findByIdAndDelete(id);

    const currentUserId = req.user._id.toString();
    const currentUserName = req.user.displayName;

    console.log(`[Group] Group ${id} (${group.groupMeta.name}) deleted by ${currentUserName}`);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:deleted', { groupId: id, conversationId: id, deletedBy: currentUserId });
      participantIds.forEach((pid) => {
        io.to(`user:${pid}`).emit('group:deleted', { groupId: id, conversationId: id, deletedBy: currentUserId });
        io.to(`user:${pid}`).emit('conversation:deleted', { conversationId: id });
      });
    }

    res.status(200).json({
      success: true,
      message: 'Group removed successfully',
      groupId: id,
    });
  } catch (error: any) {
    console.error('[Group] deleteGroup error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to remove group' });
  }
};

