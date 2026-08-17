import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { User } from '../models/User';

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'system',
  'kothahobe',
  'kotha_hobe',
  'official',
  'root',
]);

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
        username: req.user.username || '',
        usernameNormalized: req.user.usernameNormalized || '',
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

    const { username, displayName, avatarUrl } = req.body;

    // 1. Validate & Update Username (if provided)
    if (username !== undefined && typeof username === 'string') {
      const trimmedUser = username.trim();
      const normalized = trimmedUser.toLowerCase();

      if (trimmedUser.length < 3 || trimmedUser.length > 30) {
        res.status(400).json({
          success: false,
          message: 'Username must be between 3 and 30 characters long.',
        });
        return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(trimmedUser)) {
        res.status(400).json({
          success: false,
          message: 'Username can only contain letters, numbers, and underscores (no spaces or symbols).',
        });
        return;
      }

      if (RESERVED_USERNAMES.has(normalized)) {
        res.status(400).json({
          success: false,
          message: 'This username is reserved. Please choose another username.',
        });
        return;
      }

      // Check for collision with other users
      const existing = await User.findOne({
        _id: { $ne: req.user._id },
        usernameNormalized: normalized,
      });

      if (existing) {
        res.status(400).json({
          success: false,
          message: 'A user with this username already exists. Please choose another username.',
        });
        return;
      }

      req.user.username = trimmedUser;
      req.user.usernameNormalized = normalized;
    }

    // 2. Validate & Update Display Name (if provided)
    if (displayName !== undefined && typeof displayName === 'string') {
      const trimmedName = displayName.trim();
      if (trimmedName.length < 2 || trimmedName.length > 50) {
        res.status(400).json({
          success: false,
          message: 'Display Name must be between 2 and 50 characters.',
        });
        return;
      }
      req.user.displayName = trimmedName;
    }

    // 3. Avatar update
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
        username: req.user.username || '',
        usernameNormalized: req.user.usernameNormalized || '',
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl || '',
        isOnline: req.user.isOnline,
        lastSeen: req.user.lastSeen,
      },
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'A user with this username already exists. Please choose another username.',
      });
      return;
    }
    console.error('[User] updateProfile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

export const searchUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { query, username } = req.query;
    let searchTerm = ((query || username || '') as string).trim();

    if (!searchTerm) {
      res.status(400).json({ success: false, message: 'Search username is required' });
      return;
    }

    // Strip leading '@' if entered
    if (searchTerm.startsWith('@')) {
      searchTerm = searchTerm.slice(1).trim();
    }

    const normalizedSearch = searchTerm.toLowerCase();

    // Primary search: Exact normalized username
    let foundUser = await User.findOne({ usernameNormalized: normalizedSearch });

    // Fallback: If user searched by exact email
    if (!foundUser && searchTerm.includes('@')) {
      foundUser = await User.findOne({ email: normalizedSearch });
    }

    if (!foundUser) {
      res.status(200).json({ success: true, user: null, message: 'No user found with this username' });
      return;
    }

    // Do not allow messaging yourself
    if (req.user && foundUser._id.toString() === req.user._id.toString()) {
      res.status(200).json({ success: false, user: null, message: 'You cannot message your own account' });
      return;
    }

    // Return sanitized public user data (never expose email or private tokens)
    res.status(200).json({
      success: true,
      user: {
        _id: foundUser._id,
        username: foundUser.username || '',
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

export const registerPushToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.length < 10) {
      res.status(400).json({ success: false, message: 'Invalid push token' });
      return;
    }

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { fcmTokens: token.trim() },
    });

    console.log(`[FCM] Registered device push token for user ${req.user._id}`);
    res.status(200).json({ success: true, message: 'Push token registered' });
  } catch (error) {
    console.error('[FCM] Token registration error:', error);
    res.status(500).json({ success: false, message: 'Failed to register push token' });
  }
};

