import { Router } from 'express';
import { getOrCreateConversation, listConversations } from '../controllers/conversationController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', getOrCreateConversation);
router.get('/', listConversations);

export default router;
