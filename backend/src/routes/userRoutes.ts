import { Router } from 'express';
import { getMe, updateProfile, searchUserByPhone } from '../controllers/userController';
import { authenticateToken } from '../middleware/authMiddleware';
import { searchRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateToken);

router.get('/me', getMe);
router.put('/profile', updateProfile);
router.get('/search', searchRateLimiter, searchUserByPhone);

export default router;
