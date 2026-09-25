import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { getGlobalIO } from '../sockets/socketManager';
import { sendPushNotification } from '../services/notificationService';

const MAX_GROUP_MEMBERS = 10;

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

    const { name, avatarUrl = '', memberIds = [] } = req.body;

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

    const newGroup = await Conversation.create({
      isGroup: true,
      participants: allParticipantIds,
      groupMeta: {
        name: cleanName,
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : '',
        creator: creatorId,
        admins: [creatorId],
        members: membersList,
        nicknames: {},
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
      .populate('groupMeta.members.user', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.members.invitedBy', '_id displayName username');

    // Real-time broadcast to invited users
    const io = getGlobalIO();
    if (io && populated) {
      allParticipantIds.forEach((pid) => {
        io.to(`user:${pid.toString()}`).emit('conversation:new', populated);
      });

      // Send FCM push invite to invited users
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

    const group = await Conversation.findOne({ _id: id, isGroup: true })
      .populate('participants', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.admins', '_id displayName username avatarUrl')
      .populate('groupMeta.members.user', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.members.invitedBy', '_id displayName username');

    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    // Check if user is a participant or member
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

    const oldName = group.groupMeta.name;
    group.groupMeta.name = cleanName;
    await group.save();

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

    group.groupMeta.avatarUrl = typeof avatarUrl === 'string' ? avatarUrl : '';
    await group.save();

    const sysText = `${req.user.displayName || req.user.username || 'User'} updated the group icon`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const io = getGlobalIO();
    if (io) {
      io.to(`conv:${id}`).emit('group:updated', { conversationId: id, avatarUrl: group.groupMeta.avatarUrl });
    }

    res.status(200).json({ success: true, message: 'Group avatar updated', avatarUrl: group.groupMeta.avatarUrl });
  } catch (error: any) {
    console.error('[Group] updateGroupAvatar error:', error);
    res.status(500).json({ success: false, message: 'Failed to update group avatar' });
  }
};

// 5. Invite additional members (max 10 total)
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

    const existingParticipantIds = group.participants.map((p) => p.toString());

    // Filter new unique members to add
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
    const sysText = `${req.user.displayName || req.user.username} invited ${invitedNames} to the group`;
    await createGroupSystemMessage(id, req.user._id, sysText);

    const populated = await Conversation.findById(id)
      .populate('participants', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.creator', '_id displayName username avatarUrl')
      .populate('groupMeta.admins', '_id displayName username avatarUrl')
      .populate('groupMeta.members.user', '_id displayName username avatarUrl isOnline lastSeen')
      .populate('groupMeta.members.invitedBy', '_id displayName username');

    const io = getGlobalIO();
    if (io && populated) {
      // Notify new invitees
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

// 6. Accept Group Invitation
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

// 7. Decline Group Invitation
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

    // Remove user from participants & mark declined
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

// 8. Leave Group
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

    // Remove user from participants
    group.participants = group.participants.filter(
      (p) => p.toString() !== req.user!._id.toString()
    );

    // Remove or mark left in members array
    group.groupMeta.members = group.groupMeta.members.filter(
      (m) => m.user.toString() !== req.user!._id.toString()
    );

    // Remove from admins
    group.groupMeta.admins = group.groupMeta.admins.filter(
      (a) => a.toString() !== req.user!._id.toString()
    );

    // If no admins left but other accepted members exist, make the first member an admin
    const remainingAccepted = group.groupMeta.members.filter((m) => m.status === 'accepted');
    if (group.groupMeta.admins.length === 0 && remainingAccepted.length > 0) {
      group.groupMeta.admins.push(remainingAccepted[0].user);
      remainingAccepted[0].role = 'admin';
    }

    await group.save();

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

// 9. Remove Member (Admin Only)
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

    // Check if requester is admin
    const isAdmin = group.groupMeta.admins.some((a) => a.toString() === req.user!._id.toString());
    if (!isAdmin) {
      res.status(403).json({ success: false, message: 'Only group admins can remove members' });
      return;
    }

    // Cannot remove group creator
    if (group.groupMeta.creator.toString() === targetUserId) {
      res.status(400).json({ success: false, message: 'Cannot remove the group creator' });
      return;
    }

    const targetUser = await User.findById(targetUserId).select('displayName username');

    // Remove target from participants and members
    group.participants = group.participants.filter((p) => p.toString() !== targetUserId);
    group.groupMeta.members = group.groupMeta.members.filter((m) => m.user.toString() !== targetUserId);
    group.groupMeta.admins = group.groupMeta.admins.filter((a) => a.toString() !== targetUserId);

    await group.save();

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

// 10. Toggle Member Admin Status (Admin Only)
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

    const isRequesterAdmin = group.groupMeta.admins.some((a) => a.toString() === req.user!._id.toString());
    if (!isRequesterAdmin) {
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
      // Demote
      if (group.groupMeta.creator.toString() === targetUserId) {
        res.status(400).json({ success: false, message: 'Cannot demote the group creator' });
        return;
      }
      group.groupMeta.admins = group.groupMeta.admins.filter((a) => a.toString() !== targetUserId);
      group.groupMeta.members[targetIndex].role = 'member';
      sysText = `${req.user.displayName || req.user.username} dismissed ${targetUser?.displayName || 'User'} as admin`;
    } else {
      // Promote
      group.groupMeta.admins.push(new Types.ObjectId(targetUserId));
      group.groupMeta.members[targetIndex].role = 'admin';
      sysText = `${req.user.displayName || req.user.username} made ${targetUser?.displayName || 'User'} a group admin`;
    }

    await group.save();
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

// 11. Set / Update Custom Nickname for a User in the Group
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

    // Check if target user is in the group
    const isTargetInGroup = group.participants.some((p) => p.toString() === targetUserId);
    if (!isTargetInGroup) {
      res.status(404).json({ success: false, message: 'Target user is not a member of this group' });
      return;
    }

    const targetUser = await User.findById(targetUserId).select('displayName username');
    const cleanNickname = typeof nickname === 'string' ? nickname.trim().slice(0, 50) : '';

    if (!group.groupMeta.nicknames) {
      group.groupMeta.nicknames = {};
    }

    if (cleanNickname) {
      (group.groupMeta.nicknames as any)[targetUserId] = cleanNickname;
    } else {
      delete (group.groupMeta.nicknames as any)[targetUserId];
    }

    // Mark modified for Map/Object save
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
