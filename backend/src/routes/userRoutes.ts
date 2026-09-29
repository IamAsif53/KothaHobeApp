import { Router } from 'express';
import {
  getMe,
  updateProfile,
  searchUser,
  registerPushToken,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getPrivacySettings,
  updatePrivacySettings,
  getUserSessions,
  revokeSession,
  revokeOtherSessions,
  getConnectionSecurity,
  getNotificationSettings,
  updateNotificationSettings,
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

// Privacy & Security endpoints
router.get('/privacy', getPrivacySettings);
router.put('/privacy', updatePrivacySettings);
router.get('/sessions', getUserSessions);
router.delete('/sessions/:sessionId', revokeSession);
router.post('/sessions/revoke-others', revokeOtherSessions);
router.get('/security/status', getConnectionSecurity);

// Notifications & Alerts endpoints
router.get('/notifications', getNotificationSettings);
router.put('/notifications', updateNotificationSettings);

export default router;
