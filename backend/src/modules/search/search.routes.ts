import { Router } from 'express';
import { SearchController } from './search.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/search', SearchController.search);

export default router;
