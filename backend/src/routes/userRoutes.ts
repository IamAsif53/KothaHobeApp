import { Router } from 'express';
import {
  getMe,
  updateProfile,
  searchUser,
  registerPushToken,
  blockUser,
  unblockUser,
  getBlockedUsers,
} from '../controllers/userController';
import { authenticateToken } from '../middleware/authMiddleware';
import { searchRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateToken);

router.get('/me', getMe);
router.put('/profile', updateProfile);
router.get('/search', searchRateLimiter, searchUser);
router.post('/push-token', registerPushToken);

// User Block / Unblock endpoints
router.post('/block', blockUser);
router.post('/unblock', unblockUser);
router.get('/blocked', getBlockedUsers);

export default router;
