import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { searchUnified } from '../controllers/searchController';

const router = Router();

// GET /api/search?q=query&type=all|people|groups|messages|archived&limit=15
router.get('/', authenticateToken, searchUnified);

export default router;
