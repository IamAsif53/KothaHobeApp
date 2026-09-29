import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { getGlobalIO } from '../sockets/socketManager';
import mongoose from 'mongoose';

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

    // Do not show blocked users or users who have blocked current user
    if (req.user) {
      const currentUser = await User.findById(req.user._id).select('blockedUsers');
      const isBlockedByMe = currentUser?.blockedUsers?.some(
        (id: any) => id.toString() === foundUser!._id.toString()
      );
      const hasBlockedMe = foundUser.blockedUsers?.some(
        (id: any) => id.toString() === req.user!._id.toString()
      );

      if (isBlockedByMe || hasBlockedMe) {
        res.status(200).json({ success: true, user: null, message: 'No user found with this username' });
        return;
      }
    }

    // Respect privacySettings for onlinePresence and lastSeen
    const isOnline = foundUser.privacySettings?.onlinePresence !== false ? Boolean(foundUser.isOnline) : false;
    let lastSeen: Date | null = foundUser.lastSeen;
    if (foundUser.privacySettings?.lastSeen === 'nobody') {
      lastSeen = null;
    } else if (foundUser.privacySettings?.lastSeen === 'connections' && req.user) {
      // Check if current user shares a conversation with foundUser
      const sharesConv = await Conversation.exists({
        participants: { $all: [req.user._id, foundUser._id] },
      });
      if (!sharesConv) lastSeen = null;
    }

    // Return sanitized public user data (never expose email or private tokens)
    res.status(200).json({
      success: true,
      user: {
        _id: foundUser._id,
        username: foundUser.username || '',
        displayName: foundUser.displayName,
        avatarUrl: foundUser.avatarUrl || '',
        isOnline,
        lastSeen,
      },
    });
  } catch (error) {
    console.error('[User Search] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to search user' });
  }
};

export const blockUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    const { targetUserId } = req.body;
    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      res.status(400).json({ success: false, message: 'Valid targetUserId is required' });
      return;
    }
    if (req.user._id.toString() === targetUserId.toString()) {
      res.status(400).json({ success: false, message: 'Cannot block yourself' });
      return;
    }

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { blockedUsers: targetUserId },
    });

    // Also mark conversation as deletedFor current user so it disappears from chat list
    await Conversation.updateMany(
      { participants: { $all: [req.user._id, targetUserId] } },
      { $addToSet: { deletedFor: req.user._id } }
    );

    res.status(200).json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    console.error('[User Block] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to block user' });
  }
};

export const unblockUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    const { targetUserId } = req.body;
    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      res.status(400).json({ success: false, message: 'Valid targetUserId is required' });
      return;
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { blockedUsers: targetUserId },
    });

    res.status(200).json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    console.error('[User Unblock] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to unblock user' });
  }
};

export const getBlockedUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const currentUser = await User.findById(req.user._id).populate({
      path: 'blockedUsers',
      select: '_id displayName username avatarUrl isOnline lastSeen',
    });

    res.status(200).json({
      success: true,
      blockedUsers: currentUser?.blockedUsers || [],
    });
  } catch (error) {
    console.error('[Get Blocked Users] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch blocked users' });
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

    const cleanToken = token.trim();

    // 1. Remove this device token from any OTHER user accounts in DB
    await User.updateMany(
      { _id: { $ne: req.user._id }, fcmTokens: cleanToken },
      { $pull: { fcmTokens: cleanToken } }
    );

    // 2. Add exclusively to current user
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { fcmTokens: cleanToken },
    });

    console.log(`[FCM] Registered device push token for user ${req.user._id} (${req.user.displayName}): ${cleanToken.slice(0, 8)}...${cleanToken.slice(-6)}`);
    res.status(200).json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('[FCM] Token registration error:', error);
    res.status(500).json({ success: false, message: 'Failed to register push token' });
  }
};

// ============================================================
// PRIVACY & SECURITY API HANDLERS
// ============================================================

export const getPrivacySettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const user = await User.findById(req.user._id).select('privacySettings');
    const defaults = {
      readReceipts: true,
      onlinePresence: true,
      lastSeen: 'everyone' as const,
      typingIndicators: true,
      storyVisibility: 'connections' as const,
      messageRequests: 'everyone' as const,
      groupInvites: 'everyone' as const,
    };

    res.status(200).json({
      success: true,
      privacySettings: user?.privacySettings || defaults,
    });
  } catch (error) {
    console.error('[Privacy] getPrivacySettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load privacy settings' });
  }
};

export const updatePrivacySettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const {
      readReceipts,
      onlinePresence,
      lastSeen,
      typingIndicators,
      storyVisibility,
      messageRequests,
      groupInvites,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.privacySettings) {
      user.privacySettings = {
        readReceipts: true,
        onlinePresence: true,
        lastSeen: 'everyone',
        typingIndicators: true,
        storyVisibility: 'connections',
        messageRequests: 'everyone',
        groupInvites: 'everyone',
      };
    }

    if (typeof readReceipts === 'boolean') {
      user.privacySettings.readReceipts = readReceipts;
    }

    if (typeof onlinePresence === 'boolean') {
      const presenceChanged = user.privacySettings.onlinePresence !== onlinePresence;
      user.privacySettings.onlinePresence = onlinePresence;
      if (presenceChanged) {
        const io = getGlobalIO();
        if (!onlinePresence) {
          user.isOnline = false;
          if (io) io.emit('user:offline', { userId: user._id.toString(), isOnline: false, lastSeen: null });
        } else {
          user.isOnline = true;
          user.lastSeen = new Date();
          if (io) io.emit('user:online', { userId: user._id.toString(), isOnline: true });
        }
      }
    }

    if (lastSeen && ['everyone', 'connections', 'nobody'].includes(lastSeen)) {
      user.privacySettings.lastSeen = lastSeen;
    }

    if (typeof typingIndicators === 'boolean') {
      user.privacySettings.typingIndicators = typingIndicators;
    }

    if (storyVisibility && ['everyone', 'connections', 'close_friends'].includes(storyVisibility)) {
      user.privacySettings.storyVisibility = storyVisibility;
    }

    if (messageRequests && ['everyone', 'connections'].includes(messageRequests)) {
      user.privacySettings.messageRequests = messageRequests;
    }

    if (groupInvites && ['everyone', 'connections'].includes(groupInvites)) {
      user.privacySettings.groupInvites = groupInvites;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Privacy settings updated successfully',
      privacySettings: user.privacySettings,
    });
  } catch (error) {
    console.error('[Privacy] updatePrivacySettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update privacy settings' });
  }
};

export const getUserSessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const user = await User.findById(req.user._id).select('sessions');
    const currentSessionId = req.tokenPayload?.sessionId;

    const sessions = (user?.sessions || []).map((s) => ({
      sessionId: s.sessionId,
      deviceName: s.deviceName || 'Unknown Device',
      platform: s.platform || 'web',
      browser: s.browser || '',
      ipAddress: s.ipAddress || '',
      lastActiveAt: s.lastActiveAt || s.createdAt || new Date(),
      createdAt: s.createdAt || new Date(),
      isCurrent: Boolean(currentSessionId && s.sessionId === currentSessionId),
    }));

    // Sort: Current session first, then most recently active
    sessions.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
    });

    res.status(200).json({
      success: true,
      sessions,
      totalSessions: sessions.length,
    });
  } catch (error) {
    console.error('[Sessions] getUserSessions error:', error);
    res.status(500).json({ success: false, message: 'Failed to load active sessions' });
  }
};

export const revokeSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      res.status(400).json({ success: false, message: 'Session ID is required' });
      return;
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { sessions: { sessionId } },
    });

    const io = getGlobalIO();
    if (io) {
      io.to(`user:${req.user._id}`).emit('session:revoked', { sessionId });
    }

    res.status(200).json({ success: true, message: 'Device signed out successfully' });
  } catch (error) {
    console.error('[Sessions] revokeSession error:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke session' });
  }
};

export const revokeOtherSessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const currentSessionId = req.tokenPayload?.sessionId;

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (currentSessionId) {
      user.sessions = user.sessions.filter((s) => s.sessionId === currentSessionId);
    } else {
      user.sessions = [];
    }

    await user.save();

    const io = getGlobalIO();
    if (io) {
      io.to(`user:${req.user._id}`).emit('session:revoke_others', { currentSessionId });
    }

    res.status(200).json({ success: true, message: 'All other devices signed out successfully' });
  } catch (error) {
    console.error('[Sessions] revokeOtherSessions error:', error);
    res.status(500).json({ success: false, message: 'Failed to sign out other devices' });
  }
};

export const getConnectionSecurity = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      security: {
        status: 'secure',
        protocol: 'HTTPS / WSS (WebSocket Secure)',
        tlsVersion: 'TLS 1.2 / TLS 1.3',
        transportEncryption: 'Transport Layer Security (TLS Encrypted in Transit)',
        sessionProtection: 'Cryptographically signed JWT Bearer Authentication',
        authenticationMethod: 'Email OTP (SHA-256 Hash Verification)',
        databaseSecurity: 'Encrypted Cloud Storage (MongoDB Atlas with TLS)',
        verifiedActive: true,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load security status' });
  }
};

// ============================================================
// NOTIFICATIONS & ALERTS API HANDLERS
// ============================================================

export const getNotificationSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const user = await User.findById(req.user._id).select('notificationSettings');
    const defaults = {
      messages: true,
      groups: true,
      calls: true,
      missedCalls: true,
      stories: true,
      previewEnabled: true,
      sound: true,
      vibrate: true,
    };

    res.status(200).json({
      success: true,
      notificationSettings: user?.notificationSettings ? { ...defaults, ...(user.toObject().notificationSettings || {}) } : defaults,
    });
  } catch (error) {
    console.error('[Notifications] getNotificationSettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load notification settings' });
  }
};

export const updateNotificationSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { messages, groups, calls, missedCalls, stories, previewEnabled, sound, vibrate } = req.body;

    const updateFields: any = {};
    if (typeof messages === 'boolean') updateFields['notificationSettings.messages'] = messages;
    if (typeof groups === 'boolean') updateFields['notificationSettings.groups'] = groups;
    if (typeof calls === 'boolean') updateFields['notificationSettings.calls'] = calls;
    if (typeof missedCalls === 'boolean') updateFields['notificationSettings.missedCalls'] = missedCalls;
    if (typeof stories === 'boolean') updateFields['notificationSettings.stories'] = stories;
    if (typeof previewEnabled === 'boolean') updateFields['notificationSettings.previewEnabled'] = previewEnabled;
    if (typeof sound === 'boolean') updateFields['notificationSettings.sound'] = sound;
    if (typeof vibrate === 'boolean') updateFields['notificationSettings.vibrate'] = vibrate;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true }
    ).select('notificationSettings');

    res.status(200).json({
      success: true,
      message: 'Notification settings updated successfully',
      notificationSettings: updatedUser?.notificationSettings,
    });
  } catch (error) {
    console.error('[Notifications] updateNotificationSettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification settings' });
  }
};


