import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export interface TokenPayload {
  userId: string;
  phoneNumber?: string;
  email?: string;
  sessionId?: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

export interface ParsedDeviceInfo {
  deviceName: string;
  platform: 'android' | 'ios' | 'web' | 'windows' | 'macos' | 'linux';
  browser: string;
}

export function parseUserAgent(uaString: string = ''): ParsedDeviceInfo {
  const ua = uaString.toLowerCase();

  let platform: 'android' | 'ios' | 'web' | 'windows' | 'macos' | 'linux' = 'web';
  let deviceName = 'Web Browser';
  let browser = 'Browser';

  // Detect Browser
  if (ua.includes('edg/')) {
    browser = 'Edge';
  } else if (ua.includes('chrome') && !ua.includes('chromium')) {
    browser = 'Chrome';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'Opera';
  }

  // Detect Platform & Friendly Name
  if (ua.includes('android')) {
    platform = 'android';
    deviceName = 'Android Device';
  } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    platform = 'ios';
    deviceName = ua.includes('ipad') ? 'iPad' : 'iPhone';
  } else if (ua.includes('windows')) {
    platform = 'windows';
    deviceName = `Windows PC (${browser})`;
  } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
    platform = 'macos';
    deviceName = `Mac (${browser})`;
  } else if (ua.includes('linux')) {
    platform = 'linux';
    deviceName = `Linux (${browser})`;
  } else {
    platform = 'web';
    deviceName = `${browser} on Web`;
  }

  return { deviceName, platform, browser };
}
