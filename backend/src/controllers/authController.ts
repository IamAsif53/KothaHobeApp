import { Request, Response } from 'express';
import { User } from '../models/User';
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
