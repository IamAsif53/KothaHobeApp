import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ENV } from '../config/env';
import { Call } from '../models/Call';
import crypto from 'crypto';

interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const getIceServers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const iceServers: RTCIceServer[] = [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
          'stun:stun3.l.google.com:19302',
          'stun:stun4.l.google.com:19302',
          'stun:stun.cloudflare.com:3478',
        ],
      },
    ];

    let turnConfigured = false;

    // 1. Metered.ca API Key integration (fetches fresh temporary TURN credentials server-to-server)
    if (ENV.METERED_DOMAIN && ENV.METERED_API_KEY) {
      try {
        const meteredRes = await fetch(
          `https://${ENV.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${ENV.METERED_API_KEY}`
        );
        if (meteredRes.ok) {
          const meteredServers = (await meteredRes.json()) as RTCIceServer[];
          if (Array.isArray(meteredServers) && meteredServers.length > 0) {
            iceServers.push(...meteredServers);
            turnConfigured = true;
            console.log('[CallController] Successfully fetched fresh Metered TURN credentials');
          }
        } else {
          console.warn('[CallController] Metered API returned status:', meteredRes.status);
        }
      } catch (mErr) {
        console.warn('[CallController] Error fetching Metered TURN credentials:', mErr);
      }
    }

    // 2. Coturn RFC 5766 Time-limited HMAC Credentials
    if (ENV.COTURN_URL && ENV.COTURN_SECRET) {
      const ttl = 24 * 3600; // 24 hours
      const expiry = Math.floor(Date.now() / 1000) + ttl;
      const username = `${expiry}:${req.user?._id || 'kothahobe_user'}`;
      const credential = crypto
        .createHmac('sha1', ENV.COTURN_SECRET)
        .update(username)
        .digest('base64');

      const urls = ENV.COTURN_URL.split(',').map((u) => u.trim());
      iceServers.push({
        urls,
        username,
        credential,
      });
      turnConfigured = true;
      console.log('[CallController] Generated Coturn HMAC time-limited TURN credentials');
    }

    // 3. Static / Custom TURN from backend environment
    if (ENV.TURN_URL && ENV.TURN_USERNAME && ENV.TURN_CREDENTIAL) {
      const urls = ENV.TURN_URL.split(',').map((u) => u.trim());
      iceServers.push({
        urls,
        username: ENV.TURN_USERNAME,
        credential: ENV.TURN_CREDENTIAL,
      });
      turnConfigured = true;
      console.log('[CallController] Applied custom static TURN credentials from backend environment');
    }

    return res.status(200).json({
      success: true,
      turnConfigured,
      iceServers,
    });
  } catch (err: any) {
    console.error('[CallController] Error generating ICE servers:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve ICE servers',
      iceServers: [
        {
          urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'],
        },
      ],
    });
  }
};

/**
 * GET /api/calls/active
 * Retrieve current active incoming/ongoing call for the authenticated user
 */
export const getActiveCall = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const fortyFiveSecsAgo = new Date(Date.now() - 45000);
    const activeCall = await Call.findOne({
      $or: [{ receiverId: userId }, { callerId: userId }],
      status: { $in: ['calling', 'ringing', 'accepted', 'connected'] },
      startedAt: { $gte: fortyFiveSecsAgo },
    })
      .populate('callerId', 'displayName avatarUrl username')
      .populate('receiverId', 'displayName avatarUrl username')
      .sort({ createdAt: -1 });

    if (!activeCall) {
      res.status(200).json({ success: true, call: null });
      return;
    }

    const caller: any = activeCall.callerId;
    const receiver: any = activeCall.receiverId;

    res.status(200).json({
      success: true,
      call: {
        callId: activeCall.callId,
        conversationId: activeCall.conversationId,
        isIncoming: receiver?._id?.toString() === userId.toString(),
        status: activeCall.status,
        callType: activeCall.callType,
        caller: {
          _id: caller?._id,
          displayName: caller?.displayName || 'User',
          avatar: caller?.avatarUrl || '',
          username: caller?.username || '',
        },
        receiver: {
          _id: receiver?._id,
          displayName: receiver?.displayName || 'User',
          avatar: receiver?.avatarUrl || '',
          username: receiver?.username || '',
        },
      },
    });
  } catch (error: any) {
    console.error('[CallController] getActiveCall error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active call' });
  }
};

