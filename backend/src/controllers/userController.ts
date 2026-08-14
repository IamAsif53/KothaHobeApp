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

    // Find registered user
    const foundUser = await User.findOne({ phoneNumber: normalized });

    if (!foundUser) {
      res.status(444).json({ success: false, message: 'No account found for this number' });
      return;
    }

    // Do not allow messaging yourself
    if (req.user && foundUser._id.toString() === req.user._id.toString()) {
      res.status(400).json({ success: false, message: 'You cannot search or message your own number' });
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
    res.status(500).json({ success: false, message: 'Failed to search user' });
  }
};
