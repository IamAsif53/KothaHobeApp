import { Router } from 'express';
import {
  uploadMedia,
  uploadMiddleware,
  streamMedia,
  createUploadSession,
  completeUploadSession,
  getMediaInfo,
  triggerMigration,
} from '../controllers/mediaController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Public media streaming with token validation (supports query token or Bearer header)
router.get('/:filename', streamMedia);

// Authenticated media operations
router.use(authenticateToken);

router.post('/upload', uploadMiddleware.single('file'), uploadMedia);
router.post('/upload-session', createUploadSession);
router.post('/upload-complete', completeUploadSession);
router.get('/:mediaId/info', getMediaInfo);
router.post('/migrate', triggerMigration);

export default router;
