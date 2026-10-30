import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();

router.get('/google', AuthController.initiateGoogleAuth);
router.get('/google/callback', AuthController.googleCallback);
router.post('/dev-login', AuthController.devLogin);
router.get('/me', requireAuth, AuthController.getCurrentUser);
router.post('/logout', requireAuth, AuthController.logout);

export default router;
