import { Router } from 'express';
import { EmailsController } from './emails.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);

router.post('/schedule', EmailsController.schedule);
router.get('/scheduled', EmailsController.getScheduled);
router.get('/sent', EmailsController.getSent);
router.get('/:id', EmailsController.getById);

export default router;
