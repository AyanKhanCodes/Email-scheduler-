import { Router } from 'express';
import { SlackController } from './slack.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();

router.get('/connect', requireAuth, SlackController.initiateConnect);
router.get('/callback', SlackController.callback);
router.get('/status', requireAuth, SlackController.getStatus);
router.post('/disconnect', requireAuth, SlackController.disconnect);
router.post('/dev-connect', requireAuth, SlackController.devConnect);

export default router;
