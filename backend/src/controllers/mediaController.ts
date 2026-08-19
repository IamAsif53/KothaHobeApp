import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { verifyToken } from '../utils/jwt';

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  },
});

// Allowed MIME types & limits
const ALLOWED_MIMES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  // Audio
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/m4a',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported or executable file format rejected.'));
    }
  },
});

// POST /api/messages/upload
export const uploadMedia = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const { conversationId, type } = req.body;
    if (!conversationId) {
      fs.unlinkSync(file.path);
      res.status(400).json({ success: false, message: 'conversationId required' });
      return;
    }

    // Verify user is a member of the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });

    if (!conversation) {
      fs.unlinkSync(file.path);
      res.status(403).json({ success: false, message: 'Access denied to this conversation' });
      return;
    }

    const relativeUrl = `/api/messages/media/${file.filename}`;

    res.status(200).json({
      success: true,
      attachment: {
        url: relativeUrl,
        fileName: file.originalname || file.filename,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
  } catch (error: any) {
    console.error('[UploadMedia] Error:', error);
    res.status(500).json({ success: false, message: error?.message || 'File upload failed' });
  }
};

// GET /api/messages/media/:filename (Secure streaming with Range support)
export const streamMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;
    const authHeader = req.headers.authorization?.replace('Bearer ', '');
    const queryToken = req.query.token as string;
    const token = authHeader || queryToken;

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required for media access' });
      return;
    }

    let decoded: any;
    try {
      decoded = verifyToken(token);
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired media token' });
      return;
    }

    const safeFilename = Array.isArray(filename) ? filename[0] : String(filename || '');
    const filePath = path.join(UPLOADS_DIR, path.basename(safeFilename));
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;

    // Detect MIME type
    const ext = path.extname(safeFilename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.pdf') contentType = 'application/pdf';
    else if (['.webm', '.weba'].includes(ext)) contentType = 'audio/webm';
    else if (['.mp4', '.m4a'].includes(ext)) contentType = 'audio/mp4';
    else if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.aac') contentType = 'audio/aac';
    else if (ext === '.ogg' || ext === '.opus') contentType = 'audio/ogg';
    else if (ext === '.wav') contentType = 'audio/wav';
    else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (ext === '.txt') contentType = 'text/plain';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1-day client cache

    // HTTP 206 Partial Content (crucial for seekable audio/video streaming)
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
      });
      fileStream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error: any) {
    console.error('[StreamMedia] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to stream media' });
  }
};

// GET /api/conversations/:conversationId/media?category=media|documents|audio
export const getSharedMedia = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { conversationId } = req.params;
    const { category = 'media', limit = '50', before } = req.query;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });

    if (!conversation) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    let typeQuery: any = { $in: ['image', 'video'] };
    if (category === 'documents') {
      typeQuery = 'document';
    } else if (category === 'audio') {
      typeQuery = 'audio';
    }

    const query: any = {
      conversationId,
      type: typeQuery,
      isDeletedForEveryone: { $ne: true },
      deletedFor: { $ne: req.user._id },
    };

    if (before) {
      query.createdAt = { $lt: new Date(before as string) };
    }

    const parsedLimit = Math.min(parseInt(limit as string, 10) || 50, 100);
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .populate('senderId', 'displayName username avatarUrl');

    res.status(200).json({
      success: true,
      items: messages,
      hasMore: messages.length === parsedLimit,
    });
  } catch (error) {
    console.error('[GetSharedMedia] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch shared media' });
  }
};

// GET /api/conversations/:conversationId/search?q=query
export const searchInConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { conversationId } = req.params;
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Search term required' });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });

    if (!conversation) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const searchRegex = new RegExp(q.trim(), 'i');
    const messages = await Message.find({
      conversationId,
      isDeletedForEveryone: { $ne: true },
      deletedFor: { $ne: req.user._id },
      $or: [{ text: searchRegex }, { 'attachment.fileName': searchRegex }],
    })
      .sort({ createdAt: -1 })
      .limit(40);

    res.status(200).json({
      success: true,
      results: messages,
    });
  } catch (error) {
    console.error('[SearchInConversation] Error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};
