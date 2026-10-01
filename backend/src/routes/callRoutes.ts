import { Router } from 'express';
import { getIceServers, getActiveCall, declineCall, getCallHistory } from '../controllers/callController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// GET /api/calls/history
router.get('/history', authenticateToken, getCallHistory);

// GET /api/calls/active
router.get('/active', authenticateToken, getActiveCall);

// GET /api/calls/ice-servers
router.get('/ice-servers', authenticateToken, getIceServers);

// POST /api/calls/decline
router.post('/decline', authenticateToken, declineCall);

export default router;

