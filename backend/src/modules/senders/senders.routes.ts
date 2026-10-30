import { Router } from 'express';
import { SendersController } from './senders.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', SendersController.listSenders);
router.post('/', SendersController.createSender);
router.put('/:id', SendersController.updateSender);

export default router;
