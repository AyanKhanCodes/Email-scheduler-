import { Router, Request, Response } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import sendersRoutes from '../modules/senders/senders.routes.js';
import emailsRoutes from '../modules/emails/emails.routes.js';
import searchRoutes from '../modules/search/search.routes.js';
import slackRoutes from '../modules/slack/slack.routes.js';
import { prisma } from '../database/prisma.js';
import { redisClient } from '../config/redis.js';
import { esClient } from '../config/elasticsearch.js';

const router = Router();

// Health Check Endpoint (PostgreSQL, Redis, Elasticsearch)
router.get('/health', async (_req: Request, res: Response) => {
  const health: Record<string, string> = {
    uptime: `${Math.round(process.uptime())}s`,
    timestamp: new Date().toISOString(),
  };

  // Check PostgreSQL
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = 'healthy';
  } catch (err: any) {
    health.database = `unhealthy: ${err.message}`;
  }

  // Check Redis
  try {
    const pong = await redisClient.ping();
    health.redis = pong === 'PONG' ? 'healthy' : 'degraded';
  } catch (err: any) {
    health.redis = `unhealthy: ${err.message}`;
  }

  // Check Elasticsearch
  try {
    const esPing = await esClient.ping();
    health.elasticsearch = esPing ? 'healthy' : 'degraded';
  } catch (err: any) {
    health.elasticsearch = `unhealthy: ${err.message}`;
  }

  const isHealthy = Object.values(health).every((v) => !v.startsWith('unhealthy'));
  res.status(isHealthy ? 200 : 503).json(health);
});

// Mount modules
router.use('/auth', authRoutes);
router.use('/api/senders', sendersRoutes);
router.use('/api/emails', searchRoutes); // handles /api/emails/search
router.use('/api/emails', emailsRoutes);
router.use('/api/slack', slackRoutes);

export default router;
