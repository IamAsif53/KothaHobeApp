import { Router } from 'express';
import { getOrCreateConversation, listConversations } from '../controllers/conversationController';
import { getSharedMedia, searchInConversation } from '../controllers/mediaController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', getOrCreateConversation);
router.get('/', listConversations);
router.get('/:conversationId/media', getSharedMedia);
router.get('/:conversationId/search', searchInConversation);

export default router;
