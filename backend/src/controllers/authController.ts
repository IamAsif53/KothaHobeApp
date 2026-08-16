import { Request, Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/User';
import { EmailOtp } from '../models/EmailOtp';
import { sendOtpEmail } from '../services/emailService';
import { generateToken } from '../utils/jwt';

// Helper to hash OTP using SHA-256
function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

export const sendEmailOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, message: 'A valid email address is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      res.status(400).json({ success: false, message: 'Please enter a valid email format' });
      return;
    }

    // Check resend cooldown (60 seconds)
    const existingOtp = await EmailOtp.findOne({ email: normalizedEmail });
    if (existingOtp) {
      const timeSinceCreation = Date.now() - new Date(existingOtp.createdAt).getTime();
      if (timeSinceCreation < 60 * 1000) {
        const waitSec = Math.ceil((60 * 1000 - timeSinceCreation) / 1000);
        res.status(429).json({
          success: false,
          message: `Please wait ${waitSec} seconds before requesting a new code.`,
        });
        return;
      }
    }

    // Invalidate previous active OTPs for this email
    await EmailOtp.deleteMany({ email: normalizedEmail });

    // Generate cryptographically secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashOtp(rawOtp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

    // Save hashed OTP in MongoDB Atlas
    await EmailOtp.create({
      email: normalizedEmail,
      otpHash,
      attempts: 0,
      expiresAt,
      createdAt: new Date(),
    });

    // Send raw OTP via Brevo Transactional Email REST API
    const sent = await sendOtpEmail(normalizedEmail, rawOtp);

    if (!sent) {
      // If delivery failed, remove record so user can retry immediately
      await EmailOtp.deleteMany({ email: normalizedEmail });
      res.status(500).json({
        success: false,
        message: 'Could not send verification email. Please check your email address and try again.',
      });
      return;
    }

    console.log(`[Auth] OTP dispatched to ${normalizedEmail}`);
    res.status(200).json({
      success: true,
      message: 'Verification code sent.',
    });
  } catch (error) {
    console.error('[Auth] sendEmailOtp error:', error);
    res.status(500).json({ success: false, message: 'Failed to process verification request' });
  }
};

export const verifyEmailOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, otp } = req.body;
    const submittedCode = (code || otp || '').toString().trim();

    if (!email || !submittedCode) {
      res.status(400).json({ success: false, message: 'Email and 6-digit verification code are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Look up active OTP record
    const record = await EmailOtp.findOne({ email: normalizedEmail });

    if (!record) {
      res.status(400).json({
        success: false,
        message: 'Verification code has expired or is invalid. Please request a new code.',
      });
      return;
    }

    // Check expiration
    if (new Date() > record.expiresAt) {
      await EmailOtp.deleteOne({ _id: record._id });
      res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new code.',
      });
      return;
    }

    // Check maximum attempts (5 attempts limit)
    if (record.attempts >= 5) {
      await EmailOtp.deleteOne({ _id: record._id });
      res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new code.',
      });
      return;
    }

    // Compare SHA-256 hash
    const submittedHash = hashOtp(submittedCode);
    if (submittedHash !== record.otpHash) {
      record.attempts += 1;
      if (record.attempts >= 5) {
        await EmailOtp.deleteOne({ _id: record._id });
        res.status(400).json({
          success: false,
          message: 'Too many incorrect attempts. Please request a new code.',
        });
        return;
      }
      await record.save();
      const attemptsLeft = 5 - record.attempts;
      res.status(400).json({
        success: false,
        message: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining.`,
      });
      return;
    }

    // OTP is valid! Delete record immediately
    await EmailOtp.deleteOne({ _id: record._id });

    // Atomic find-or-create user in MongoDB Atlas
    let user = await User.findOne({ email: normalizedEmail });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const defaultName = normalizedEmail.split('@')[0];
      user = await User.create({
        email: normalizedEmail,
        emailVerified: true,
        displayName: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
        isOnline: true,
        lastSeen: new Date(),
      });
    } else {
      user.emailVerified = true;
      user.isOnline = true;
      user.lastSeen = new Date();
      await user.save();
    }

    // Generate JWT Session Token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
    });

    const hasProfile = Boolean(user.username && user.displayName && user.displayName !== 'New User');

    console.log(`[Auth] User authenticated: ${user.email} (hasProfile: ${hasProfile})`);

    res.status(200).json({
      success: true,
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      token,
      isNewUser,
      hasProfile,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username || '',
        usernameNormalized: user.usernameNormalized || '',
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || '',
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      },
    });
  } catch (error) {
    console.error('[Auth] verifyEmailOtp error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};
