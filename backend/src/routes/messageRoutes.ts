import { Router } from 'express';
import { getMessages } from '../controllers/messageController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/:conversationId/messages', getMessages);

export default router;
