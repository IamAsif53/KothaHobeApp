import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';
import { User, IUser } from '../models/User';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  tokenPayload?: TokenPayload;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Access token required' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    let user = await User.findById(decoded.userId);
    if (!user && decoded.email) {
      user = await User.findOne({ email: decoded.email.toLowerCase() });
      if (!user) {
        user = await User.create({
          email: decoded.email.toLowerCase(),
          displayName: decoded.email.split('@')[0],
          emailVerified: true,
          isOnline: true,
          lastSeen: new Date(),
        });
      }
    } else if (!user && decoded.phoneNumber) {
      user = await User.findOne({ phoneNumber: decoded.phoneNumber });
      if (!user) {
        user = await User.create({
          phoneNumber: decoded.phoneNumber,
          displayName: `User ${decoded.phoneNumber.slice(-4)}`,
          phoneVerified: true,
          isOnline: true,
          lastSeen: new Date(),
        });
      }
    }

    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Authentication error', error: (error as Error).message });
  }
};
