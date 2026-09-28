import { Router } from 'express';
import {
  createGroup,
  getGroupDetails,
  updateGroupName,
  updateGroupAvatar,
  updateGroupDescription,
  getInviteLink,
  resetInviteLink,
  getGroupByInviteCode,
  joinGroupByInviteCode,
  acceptJoinRequest,
  declineJoinRequest,
  inviteMembers,
  acceptGroupInvite,
  declineGroupInvite,
  leaveGroup,
  removeMember,
  toggleAdmin,
  updateMemberRole,
  transferOwnership,
  setGroupNickname,
  deleteGroup,
  getPinnedMessages,
  pinMessage,
  unpinMessage,
  updateNotificationSettings,
  updateDisappearingMessages,
  updateGroupPermissions,
  updateGroupPrivacy,
  getGroupEvents,
  createGroupEvent,
  rsvpGroupEvent,
  deleteGroupEvent,
  getGroupPolls,
  createGroupPoll,
  voteGroupPoll,
  closeGroupPoll,
  getAdminActivityLogs,
} from '../controllers/groupController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Invite preview route (supports optional/authenticated token)
router.get('/join/:inviteCode', getGroupByInviteCode);

router.use(authenticateToken);

// Invite code actions
router.post('/join/:inviteCode', joinGroupByInviteCode);

// Group management endpoints
router.post('/', createGroup);
router.get('/:id', getGroupDetails);
router.delete('/:id', deleteGroup);
router.put('/:id/name', updateGroupName);
router.put('/:id/avatar', updateGroupAvatar);
router.put('/:id/description', updateGroupDescription);
router.get('/:id/invite', getInviteLink);
router.post('/:id/invite/reset', resetInviteLink);
router.post('/:id/join-requests/:targetUserId/accept', acceptJoinRequest);
router.post('/:id/join-requests/:targetUserId/decline', declineJoinRequest);
router.post('/:id/members', inviteMembers);
router.post('/:id/accept', acceptGroupInvite);
router.post('/:id/decline', declineGroupInvite);
router.post('/:id/leave', leaveGroup);
router.delete('/:id/members/:targetUserId', removeMember);
router.put('/:id/members/:targetUserId/admin', toggleAdmin);
router.put('/:id/members/:targetUserId/role', updateMemberRole);
router.post('/:id/transfer-ownership', transferOwnership);
router.put('/:id/nickname', setGroupNickname);

// Pinned messages
router.get('/:id/pinned', getPinnedMessages);
router.post('/:id/pinned/:messageId', pinMessage);
router.delete('/:id/pinned/:messageId', unpinMessage);

// Settings & Permissions & Privacy
router.put('/:id/notifications', updateNotificationSettings);
router.put('/:id/disappearing', updateDisappearingMessages);
router.put('/:id/permissions', updateGroupPermissions);
router.put('/:id/privacy', updateGroupPrivacy);

// Social: Events
router.get('/:id/events', getGroupEvents);
router.post('/:id/events', createGroupEvent);
router.post('/:id/events/:eventId/rsvp', rsvpGroupEvent);
router.delete('/:id/events/:eventId', deleteGroupEvent);

// Social: Polls
router.get('/:id/polls', getGroupPolls);
router.post('/:id/polls', createGroupPoll);
router.post('/:id/polls/:pollId/vote', voteGroupPoll);
router.post('/:id/polls/:pollId/close', closeGroupPoll);

// Admin Activity Log
router.get('/:id/activity', getAdminActivityLogs);

export default router;
