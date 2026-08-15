import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { User } from '../models/User';
import { normalizePhoneNumber } from '../utils/phoneUtils';

export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    res.status(200).json({
      success: true,
      user: {
        _id: req.user._id,
        phoneNumber: req.user.phoneNumber,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl || '',
        isOnline: req.user.isOnline,
        lastSeen: req.user.lastSeen,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch user profile' });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { displayName, avatarUrl } = req.body;

    if (displayName && typeof displayName === 'string') {
      req.user.displayName = displayName.trim();
    }

    if (typeof avatarUrl === 'string') {
      req.user.avatarUrl = avatarUrl;
    }

    await req.user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: req.user._id,
        phoneNumber: req.user.phoneNumber,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl || '',
        isOnline: req.user.isOnline,
        lastSeen: req.user.lastSeen,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

export const searchUserByPhone = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { phone } = req.query;

    if (!phone || typeof phone !== 'string') {
      res.status(400).json({ success: false, message: 'Phone query parameter is required' });
      return;
    }

    const normalized = normalizePhoneNumber(phone);
    const suffix = normalized.slice(-10); // Match last 10 digits e.g. 1813635343

    // Find registered user by exact E.164 format or suffix pattern
    const foundUser = await User.findOne({
      $or: [
        { phoneNumber: normalized },
        { phoneNumber: { $regex: suffix + '$' } }
      ]
    });

    if (!foundUser) {
      res.status(200).json({ success: true, user: null, message: 'No account found for this number' });
      return;
    }

    // Do not allow messaging yourself
    if (req.user && foundUser._id.toString() === req.user._id.toString()) {
      res.status(200).json({ success: false, user: null, message: 'You cannot message your own number' });
      return;
    }

    // Return minimum information required
    res.status(200).json({
      success: true,
      user: {
        _id: foundUser._id,
        phoneNumber: foundUser.phoneNumber,
        displayName: foundUser.displayName,
        avatarUrl: foundUser.avatarUrl || '',
        isOnline: foundUser.isOnline,
        lastSeen: foundUser.lastSeen,
      },
    });
  } catch (error) {
    console.error('[User Search] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to search user' });
  }
};
