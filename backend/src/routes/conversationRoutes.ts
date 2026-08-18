import { Router } from 'express';
import {
  getOrCreateConversation,
  listConversations,
  clearChatHistory,
  deleteConversation,
} from '../controllers/conversationController';
import { getSharedMedia, searchInConversation } from '../controllers/mediaController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', getOrCreateConversation);
router.get('/', listConversations);
router.post('/:conversationId/clear', clearChatHistory);
router.delete('/:conversationId', deleteConversation);
router.get('/:conversationId/media', getSharedMedia);
router.get('/:conversationId/search', searchInConversation);

export default router;
