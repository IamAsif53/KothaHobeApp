import { Router } from 'express';
import {
  getStoryFeed,
  createStory,
  viewStory,
  reactToStory,
  replyToStory,
  getStoryViewers,
  deleteStory,
  getStoryArchive,
} from '../controllers/storyController';
import { uploadMedia, uploadMiddleware } from '../controllers/mediaController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Story Feed & Management
router.get('/feed', getStoryFeed);
router.post('/', createStory);
router.post('/upload', uploadMiddleware.single('file'), uploadMedia);
router.get('/archive', getStoryArchive);
router.post('/:id/view', viewStory);
router.post('/:id/reaction', reactToStory);
router.post('/:id/reply', replyToStory);
router.get('/:id/viewers', getStoryViewers);
router.delete('/:id', deleteStory);

export default router;
