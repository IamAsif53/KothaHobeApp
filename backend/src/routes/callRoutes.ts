import { Router } from 'express';
import { getIceServers, getActiveCall } from '../controllers/callController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// GET /api/calls/active
router.get('/active', authenticateToken, getActiveCall);

// GET /api/calls/ice-servers
router.get('/ice-servers', authenticateToken, getIceServers);

export default router;
