import { Router } from 'express';
import { getMessages, markMessageDelivered, sendDirectReply, markConversationAsRead } from '../controllers/messageController';
import { uploadMedia, uploadMiddleware, streamMedia } from '../controllers/mediaController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Secure media streaming (token can be query token for direct <img>, <audio>, or fetch with auth header)
router.get('/media/:filename', streamMedia);

// Authenticated message routes
router.use(authenticateToken);

router.get('/:conversationId/messages', getMessages);
router.post('/upload', uploadMiddleware.single('file'), uploadMedia);
router.post('/delivered', markMessageDelivered);
router.post('/reply-direct', sendDirectReply);
router.post('/mark-read', markConversationAsRead);

export default router;
