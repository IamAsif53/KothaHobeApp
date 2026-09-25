import { Router } from 'express';
import {
  createGroup,
  getGroupDetails,
  updateGroupName,
  updateGroupAvatar,
  inviteMembers,
  acceptGroupInvite,
  declineGroupInvite,
  leaveGroup,
  removeMember,
  toggleAdmin,
  setGroupNickname,
} from '../controllers/groupController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Group management endpoints
router.post('/', createGroup);
router.get('/:id', getGroupDetails);
router.put('/:id/name', updateGroupName);
router.put('/:id/avatar', updateGroupAvatar);
router.post('/:id/members', inviteMembers);
router.post('/:id/accept', acceptGroupInvite);
router.post('/:id/decline', declineGroupInvite);
router.post('/:id/leave', leaveGroup);
router.delete('/:id/members/:targetUserId', removeMember);
router.put('/:id/members/:targetUserId/admin', toggleAdmin);
router.put('/:id/nickname', setGroupNickname);

export default router;
