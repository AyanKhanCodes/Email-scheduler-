import { Worker, Job } from 'bullmq';
import { redisConnectionOptions } from '../config/redis.js';
import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { getEmailTransporter, getTestPreviewUrl } from '../config/nodemailer.js';
import { RateLimiterService } from '../services/rate-limiter.service.js';
import { SlackService } from '../services/slack.service.js';
import { SearchService } from '../services/search.service.js';
import { EMAIL_QUEUE_NAME, rescheduleEmailJob, EmailJobData } from '../queues/email.queue.js';

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const { emailId } = job.data;
      console.log(`[Worker] Processing email job: ${job.id} (Email ID: ${emailId}, Attempt: ${job.attemptsMade + 1})`);

      // 1. Fetch email and sender from PostgreSQL
      const email = await prisma.email.findUnique({
        where: { id: emailId },
        include: { sender: true },
      });

      if (!email) {
        console.warn(`[Worker] Email ${emailId} not found in database. Skipping job.`);
        return { success: false, reason: 'Email not found' };
      }

      // 2. Idempotency Check: if already sent, never send again
      if (email.status === 'sent') {
        console.log(`[Worker] Email ${emailId} is already marked as 'sent'. Skipping for idempotency.`);
        return { success: true, alreadySent: true };
      }

      // 3. Hourly Rate Limit Check
      const rateLimitCheck = await RateLimiterService.checkAndReserveHourlySlot(
        email.senderId,
        email.sender.hourlyLimit
      );

      if (!rateLimitCheck.allowed) {
        console.warn(
          `[Worker] Sender ${email.sender.email} reached hourly limit (${rateLimitCheck.limit}/hr). Rescheduling job to next window: ${rateLimitCheck.nextHourDate.toISOString()}`
        );

        // Update database with rescheduled time
        await prisma.email.update({
          where: { id: emailId },
          data: {
            scheduledAt: rateLimitCheck.nextHourDate,
            status: 'scheduled',
          },
        });

        // Update Elasticsearch
        await SearchService.updateEmailStatus(emailId, 'scheduled');

        // Reschedule BullMQ delayed job
        await rescheduleEmailJob(emailId, rateLimitCheck.nextHourDate);

        // Trigger Slack rate-limit alert (deduplicated)
        await SlackService.notifyHourlyLimitReached({
          userId: email.userId,
          senderId: email.senderId,
          senderEmail: email.sender.email,
          hourlyLimit: rateLimitCheck.limit,
          hourWindow: rateLimitCheck.hourWindow,
          rescheduledTime: rateLimitCheck.nextHourDate,
        });

        return {
          success: false,
          rescheduled: true,
          nextRun: rateLimitCheck.nextHourDate,
        };
      }

      // 4. Distributed Minimum Send Delay Coordination
      const effectiveMinDelay = RateLimiterService.getEffectiveMinDelay(email.sender.minimumDelay);
      const waitMs = await RateLimiterService.reserveSendSpacingSlot(email.senderId, effectiveMinDelay);

      if (waitMs > 0) {
        if (waitMs <= 10000) {
          console.log(`[Worker] Coordinated send spacing: waiting ${waitMs}ms before sending email ${emailId}`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else {
          // If wait is larger than 10 seconds, reschedule to exact slot
          console.log(`[Worker] Spacing wait is ${waitMs}ms. Rescheduling to slot...`);
          const slotDate = new Date(Date.now() + waitMs);
          await prisma.email.update({
            where: { id: emailId },
            data: { scheduledAt: slotDate, status: 'scheduled' },
          });
          await rescheduleEmailJob(emailId, slotDate);
          return { success: false, rescheduled: true, nextRun: slotDate };
        }
      }

      // 5. Update status to 'processing'
      await prisma.email.update({
        where: { id: emailId },
        data: { status: 'processing' },
      });
      await SearchService.updateEmailStatus(emailId, 'processing');

      // 6. Deliver email through Nodemailer + Ethereal SMTP
      try {
        const transporter = await getEmailTransporter();
        const mailOptions = {
          from: `"${email.sender.name}" <${email.sender.email}>`,
          to: email.recipientEmail,
          subject: email.subject,
          text: email.body,
          html: `<div style="font-family: sans-serif; line-height: 1.6; color: #333;">${email.body.replace(/\n/g, '<br/>')}</div>`,
        };

        const info = await transporter.sendMail(mailOptions);
        const previewUrl = getTestPreviewUrl(info);

        const sentAt = new Date();

        // 7. Success state updates
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'sent',
            sentAt,
            failureReason: null,
          },
        });

        await SearchService.updateEmailStatus(emailId, 'sent', sentAt);

        console.log(`[Worker] Email ${emailId} successfully sent to ${email.recipientEmail}!`);
        if (previewUrl) {
          console.log(`[Worker] 📬 Ethereal Preview URL: ${previewUrl}`);
        }

        return {
          success: true,
          messageId: info.messageId,
          previewUrl: previewUrl || undefined,
        };
      } catch (sendError: any) {
        console.error(`[Worker] Delivery failed for email ${emailId}: ${sendError.message}`);

        const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);

        if (isLastAttempt) {
          await prisma.email.update({
            where: { id: emailId },
            data: {
              status: 'failed',
              failureReason: sendError.message,
            },
          });
          await SearchService.updateEmailStatus(emailId, 'failed');
        }

        // Rethrow so BullMQ activates exponential backoff retry policy
        throw sendError;
      }
    },
    {
      connection: redisConnectionOptions,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
  });

  return worker;
}

// Standalone worker runner if executed directly
if (process.argv[1]?.endsWith('email.worker.ts') || process.argv[1]?.endsWith('email.worker.js')) {
  console.log(`[Worker] Starting standalone email worker with concurrency ${env.WORKER_CONCURRENCY}...`);
  createEmailWorker();
}
