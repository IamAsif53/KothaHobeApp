import { Router } from 'express';
import { firebaseLogin, sendEmailOtp, verifyEmailOtp } from '../controllers/authController';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/firebase-login', authRateLimiter, firebaseLogin);
router.post('/send-email-otp', authRateLimiter, sendEmailOtp);
router.post('/verify-email-otp', authRateLimiter, verifyEmailOtp);

export default router;
