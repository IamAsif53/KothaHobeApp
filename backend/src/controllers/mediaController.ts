import { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { verifyToken } from '../utils/jwt';
import { MediaStorageService } from '../services/storage/MediaStorageService';
import { MigrationService } from '../services/storage/migrationService';
import { MediaMetadata } from '../models/MediaMetadata';

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

// Upload middleware with file verification
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (
      ALLOWED_MIMES.has(file.mimetype) ||
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('audio/')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported or executable file format rejected.'));
    }
  },
});

function decodeUtf8Filename(name: string): string {
  if (!name || typeof name !== 'string') return '';
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded && !decoded.includes('\uFFFD') ? decoded : name;
  } catch {
    return name;
  }
}

// POST /api/messages/upload (Standard Multipart Upload through Storage Service)
export const uploadMedia = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const uploadStartTime = Date.now();
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const { conversationId, type, originalName: explicitOriginalName } = req.body;
    if (!conversationId) {
      res.status(400).json({ success: false, message: 'conversationId required' });
      return;
    }

    // Verify user is an active participant of the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });

    if (!conversation) {
      res.status(403).json({ success: false, message: 'Access denied to this conversation' });
      return;
    }

    // Accurately preserve Unicode/Bengali original filename
    const rawFilename = explicitOriginalName || file.originalname || 'file';
    const originalName = decodeUtf8Filename(rawFilename);
    const finalMime = file.mimetype || 'application/octet-stream';

    const storageService = MediaStorageService.getInstance();
    const result = await storageService.upload(file.buffer, {
      originalName,
      mimeType: finalMime,
      conversationId,
      uploaderId: req.user._id.toString(),
      size: file.size,
      type,
    });

    const elapsedMs = Date.now() - uploadStartTime;
    console.log(
      `[MediaUpload] Uploaded "${originalName}" (${file.size} bytes, ${result.attachment.storageProvider}) in ${elapsedMs}ms`
    );

    res.status(200).json({
      success: true,
      attachment: result.attachment,
    });
  } catch (error: any) {
    console.error('[UploadMedia] Error:', error);
    res.status(500).json({ success: false, message: error?.message || 'File upload failed' });
  }
};

// POST /api/media/upload-session (Initiate Direct Cloud Presigned Upload Session)
export const createUploadSession = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { conversationId, originalName, mimeType, size, type } = req.body;

    if (!conversationId || !originalName || !mimeType) {
      res.status(400).json({
        success: false,
        message: 'conversationId, originalName, and mimeType are required',
      });
      return;
    }

    // Verify user is in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });

    if (!conversation) {
      res.status(403).json({ success: false, message: 'Access denied to this conversation' });
      return;
    }

    const storageService = MediaStorageService.getInstance();

    if (!storageService.isDirectCloudUploadSupported()) {
      res.status(200).json({
        success: true,
        directUploadSupported: false,
        fallbackEndpoint: '/api/messages/upload',
        message: 'Direct cloud upload not configured, please use standard multipart upload',
      });
      return;
    }

    const cleanName = decodeUtf8Filename(originalName);
    const session = await storageService.createDirectUploadSession({
      originalName: cleanName,
      mimeType,
      conversationId,
      uploaderId: req.user._id.toString(),
      size: Number(size) || undefined,
      type,
    });

    res.status(200).json({
      success: true,
      directUploadSupported: true,
      session,
    });
  } catch (error: any) {
    console.error('[CreateUploadSession] Error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to create upload session' });
  }
};

// POST /api/media/upload-complete (Finalize Direct Cloud Upload Session)
export const completeUploadSession = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ success: false, message: 'sessionId is required' });
      return;
    }

    const storageService = MediaStorageService.getInstance();
    const result = await storageService.completeDirectUploadSession(
      sessionId,
      req.user._id.toString()
    );

    res.status(200).json({
      success: true,
      attachment: result.attachment,
    });
  } catch (error: any) {
    console.error('[CompleteUploadSession] Error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to complete upload session' });
  }
};

// GET /api/messages/media/:filename and GET /api/media/:mediaId
export const streamMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, mediaId } = req.params;
    const identifier = filename || mediaId;

    const authHeader = req.headers.authorization?.replace('Bearer ', '');
    const queryToken = req.query.token as string;
    const token = authHeader || queryToken;

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required for media access' });
      return;
    }

    try {
      verifyToken(token);
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired media token' });
      return;
    }

    const safeIdentifier = Array.isArray(identifier) ? identifier[0] : String(identifier || '');
    const cleanKey = path.basename(safeIdentifier);
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;

    const storageService = MediaStorageService.getInstance();

    // 1. Partial byte-range request (HTTP 206) for video/audio seeking
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Number.MAX_SAFE_INTEGER;

      try {
        const rangeResult = await storageService.getRangeStream(cleanKey, start, end);

        res.writeHead(206, {
          'Content-Range': `bytes ${rangeResult.start}-${rangeResult.end}/${rangeResult.totalLength}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': rangeResult.contentLength,
          'Content-Type': rangeResult.mimeType,
          'Cache-Control': 'public, max-age=86400',
        });

        rangeResult.stream.pipe(res);
        return;
      } catch (rangeErr) {
        console.warn('[StreamMedia] Range stream failed, attempting full stream fallback:', rangeErr);
      }
    }

    // 2. Full file stream
    const { stream, metadata } = await storageService.getStream(cleanKey);

    res.setHeader('Content-Type', metadata.mimeType);
    res.setHeader('Content-Length', metadata.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (metadata.checksum) {
      res.setHeader('ETag', `"${metadata.checksum}"`);
    }

    stream.pipe(res);
  } catch (error: any) {
    console.error('[StreamMedia] Error:', error);
    res.status(404).json({ success: false, message: 'Media file not found' });
  }
};

// GET /api/media/:mediaId/info
export const getMediaInfo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const rawMediaId = req.params.mediaId;
    const mediaIdStr = Array.isArray(rawMediaId) ? rawMediaId[0] : String(rawMediaId || '');
    const cleanMediaId = path.basename(mediaIdStr);

    const media = await MediaMetadata.findOne({
      $or: [
        { mediaKey: cleanMediaId },
        { objectKey: cleanMediaId },
      ],
      status: { $ne: 'deleted' },
    });

    if (!media) {
      res.status(404).json({ success: false, message: 'Media not found' });
      return;
    }

    res.status(200).json({
      success: true,
      media: {
        mediaId: media._id,
        mediaKey: media.mediaKey,
        originalName: media.originalName,
        mimeType: media.mimeType,
        size: media.size,
        storageProvider: media.storageProvider,
        url: media.url,
        createdAt: media.createdAt,
      },
    });
  } catch (error: any) {
    console.error('[GetMediaInfo] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch media information' });
  }
};

// POST /api/media/migrate (Admin/Dev batch migration tool)
export const triggerMigration = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { batchSize = 20, limit = 100, dryRun = false } = req.body;
    const progress = await MigrationService.migrateGridFSToObjectStorage({
      batchSize: Number(batchSize),
      limit: Number(limit),
      dryRun: Boolean(dryRun),
    });

    res.status(200).json({
      success: true,
      progress,
    });
  } catch (error: any) {
    console.error('[TriggerMigration] Error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Migration failed' });
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
      viewOnce: { $ne: true },
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
