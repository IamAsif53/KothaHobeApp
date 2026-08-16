import { Router } from 'express';
import { sendEmailOtp, verifyEmailOtp } from '../controllers/authController';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/send-email-otp', authRateLimiter, sendEmailOtp);
router.post('/verify-email-otp', authRateLimiter, verifyEmailOtp);

export default router;
