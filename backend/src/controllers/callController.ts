import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ENV } from '../config/env';
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
