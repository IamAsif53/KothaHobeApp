import { Router } from 'express';
import {
  getMessages,
  markMessageDelivered,
  sendDirectReply,
  markConversationAsRead,
  editMessage,
  forwardMessage,
  getLinkPreview,
  createMessage,
  deleteMessage,
} from '../controllers/messageController';
import { uploadMedia, uploadMiddleware, streamMedia } from '../controllers/mediaController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Secure media streaming (token can be query token for direct <img>, <audio>, or fetch with auth header)
router.get('/media/:filename', streamMedia);

// Authenticated message routes
router.use(authenticateToken);

router.get('/:conversationId/messages', getMessages);
router.post('/upload', uploadMiddleware.single('file'), uploadMedia);
router.post('/send', createMessage);
router.delete('/:messageId', deleteMessage);
router.post('/delivered', markMessageDelivered);
router.post('/reply-direct', sendDirectReply);
router.post('/mark-read', markConversationAsRead);
router.put('/:messageId/edit', editMessage);
router.post('/forward', forwardMessage);
router.post('/link-preview', getLinkPreview);

export default router;
