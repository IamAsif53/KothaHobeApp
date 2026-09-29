import { Router } from 'express';
import {
  getOrCreateConversation,
  listConversations,
  getConversationDetails,
  clearChatHistory,
  deleteConversation,
  archiveConversation,
  unarchiveConversation,
} from '../controllers/conversationController';
import { getSharedMedia, searchInConversation } from '../controllers/mediaController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', getOrCreateConversation);
router.get('/', listConversations);
router.get('/:conversationId', getConversationDetails);
router.post('/:conversationId/clear', clearChatHistory);
router.delete('/:conversationId', deleteConversation);
router.put('/:conversationId/archive', archiveConversation);
router.put('/:conversationId/unarchive', unarchiveConversation);
router.get('/:conversationId/media', getSharedMedia);
router.get('/:conversationId/search', searchInConversation);

export default router;
