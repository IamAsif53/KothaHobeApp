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
        email: req.user.email || '',
        phoneNumber: req.user.phoneNumber || '',
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
        email: req.user.email || '',
        phoneNumber: req.user.phoneNumber || '',
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

export const searchUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { query, email, phone } = req.query;
    const searchTerm = ((query || email || phone || '') as string).trim();

    if (!searchTerm) {
      res.status(400).json({ success: false, message: 'Search query is required' });
      return;
    }

    let foundUser = null;

    // 1. If it looks like an email or contains @
    if (searchTerm.includes('@')) {
      const normalizedEmail = searchTerm.toLowerCase().trim();
      foundUser = await User.findOne({ email: normalizedEmail });
    } else {
      // 2. Search by exact email or phone or displayName
      const normalizedPhone = normalizePhoneNumber(searchTerm);
      const suffix = normalizedPhone ? normalizedPhone.slice(-10) : '';

      foundUser = await User.findOne({
        $or: [
          { email: searchTerm.toLowerCase() },
          ...(normalizedPhone ? [{ phoneNumber: normalizedPhone }, { phoneNumber: { $regex: suffix + '$' } }] : []),
          { displayName: { $regex: new RegExp(`^${searchTerm}$`, 'i') } },
        ],
      });
    }

    if (!foundUser) {
      res.status(200).json({ success: true, user: null, message: 'No account found with this email' });
      return;
    }

    // Do not allow messaging yourself
    if (req.user && foundUser._id.toString() === req.user._id.toString()) {
      res.status(200).json({ success: false, user: null, message: 'You cannot message your own account' });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        _id: foundUser._id,
        email: foundUser.email || '',
        phoneNumber: foundUser.phoneNumber || '',
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

export const searchUserByPhone = searchUser;
