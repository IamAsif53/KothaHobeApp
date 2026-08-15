import { Request, Response } from 'express';
import { User } from '../models/User';
import { EmailOtp } from '../models/EmailOtp';
import { sendOtpEmail } from '../services/emailService';
import { generateToken } from '../utils/jwt';
import { normalizePhoneNumber, isValidE164Phone } from '../utils/phoneUtils';

export const firebaseLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, firebaseIdToken, displayName } = req.body;

    if (!phoneNumber) {
      res.status(400).json({ success: false, message: 'Phone number is required' });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!isValidE164Phone(normalizedPhone)) {
      res.status(400).json({ success: false, message: 'Invalid E.164 phone number format' });
      return;
    }

    // Check if user exists in database
    let user = await User.findOne({ phoneNumber: normalizedPhone });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        phoneNumber: normalizedPhone,
        displayName: displayName || `User ${normalizedPhone.slice(-4)}`,
        phoneVerified: true,
        isOnline: true,
        lastSeen: new Date(),
      });
    } else {
      user.phoneVerified = true;
      user.isOnline = true;
      user.lastSeen = new Date();
      await user.save();
    }

    // Generate app JWT session token
    const token = generateToken({
      userId: user._id.toString(),
      phoneNumber: user.phoneNumber,
    });

    res.status(200).json({
      success: true,
      message: isNewUser ? 'User registered successfully' : 'User authenticated successfully',
      token,
      isNewUser,
      user: {
        _id: user._id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || '',
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ success: false, message: 'Authentication failed', error: (error as Error).message });
  }
};

export const sendEmailOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, message: 'Valid email address is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      res.status(400).json({ success: false, message: 'Please enter a valid email format' });
      return;
    }

    // Generate random 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store in MongoDB Atlas with TTL auto-expiration
    await EmailOtp.findOneAndUpdate(
      { email: normalizedEmail },
      { otp, expiresAt, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // Send real HTML email via Resend
    const sent = await sendOtpEmail(normalizedEmail, otp);

    if (!sent) {
      res.status(500).json({
        success: false,
        message: 'Could not send verification email. Please check your Resend configuration.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Verification code sent to ${normalizedEmail}`,
    });
  } catch (error) {
    console.error('[Auth] sendEmailOtp error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP email', error: (error as Error).message });
  }
};

export const verifyEmailOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      res.status(400).json({ success: false, message: 'Email and 6-digit OTP code are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify OTP in MongoDB Atlas
    const record = await EmailOtp.findOne({ email: normalizedEmail, otp: otp.trim() });

    if (!record) {
      res.status(400).json({ success: false, message: 'Invalid verification code. Please check your email.' });
      return;
    }

    if (record.expiresAt < new Date()) {
      await EmailOtp.deleteOne({ _id: record._id });
      res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new code.' });
      return;
    }

    // Remove used OTP
    await EmailOtp.deleteOne({ _id: record._id });

    // Find or create user in MongoDB Atlas
    let user = await User.findOne({ email: normalizedEmail });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const defaultName = normalizedEmail.split('@')[0];
      user = await User.create({
        email: normalizedEmail,
        displayName: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
        emailVerified: true,
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

    res.status(200).json({
      success: true,
      message: isNewUser ? 'Account registered successfully' : 'Login successful',
      token,
      isNewUser,
      user: {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || '',
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      },
    });
  } catch (error) {
    console.error('[Auth] verifyEmailOtp error:', error);
    res.status(500).json({ success: false, message: 'Verification failed', error: (error as Error).message });
  }
};
