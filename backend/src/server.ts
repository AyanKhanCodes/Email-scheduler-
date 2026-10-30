import { createApp } from './app.js';
import { env } from './config/env.js';
import { initElasticsearch } from './config/elasticsearch.js';
import { getEmailTransporter } from './config/nodemailer.js';
import { createEmailWorker } from './workers/email.worker.js';
import { emailQueue } from './queues/email.queue.js';
import { redisClient } from './config/redis.js';
import { prisma } from './database/prisma.js';

async function bootstrap() {
  console.log('🚀 Starting ReachInbox Email Job Scheduler Backend...');

  // 1. Initialize Elasticsearch index
  await initElasticsearch();

  // 2. Initialize Ethereal SMTP transporter
  await getEmailTransporter();

  // 3. Start BullMQ worker
  const worker = createEmailWorker();
  console.log(`[BullMQ] Worker started with concurrency: ${env.WORKER_CONCURRENCY}`);

  // 4. Create and start Express app
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`\n==================================================`);
    console.log(` ReachInbox Backend running on http://localhost:${env.PORT}`);
    console.log(` Health check:        http://localhost:${env.PORT}/health`);
    console.log(` Bull Board UI:       http://localhost:${env.PORT}/admin/queues`);
    console.log(` Concurrency:         ${env.WORKER_CONCURRENCY}`);
    console.log(` Min send delay:      ${env.MIN_DELAY_BETWEEN_EMAILS_MS}ms`);
    console.log(` Max/hour/sender:     ${env.MAX_EMAILS_PER_HOUR_PER_SENDER}`);
    console.log(`==================================================\n`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log('[Server] HTTP server closed.');
      await worker.close();
      console.log('[BullMQ] Worker closed.');
      await emailQueue.close();
      console.log('[BullMQ] Queue closed.');
      await redisClient.quit();
      console.log('[Redis] Connection closed.');
      await prisma.$disconnect();
      console.log('[Prisma] Database disconnected.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
