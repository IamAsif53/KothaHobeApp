import { Router } from 'express';
import { firebaseLogin } from '../controllers/authController';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/firebase-login', authRateLimiter, firebaseLogin);

export default router;
