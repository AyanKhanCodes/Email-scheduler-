import { Queue } from 'bullmq';
import { redisConnectionOptions } from '../config/redis.js';
import { calculateDelayMs } from '../utils/time.js';

export const EMAIL_QUEUE_NAME = 'email-queue';
export const SEND_EMAIL_JOB_NAME = 'send-email';

export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // keep for 24 hours
      count: 2000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // keep for 7 days
      count: 5000,
    },
  },
});

export async function addEmailJob(emailId: string, scheduledAt: Date) {
  const delay = calculateDelayMs(scheduledAt);

  return await emailQueue.add(
    SEND_EMAIL_JOB_NAME,
    { emailId },
    {
      jobId: emailId, // Stable job ID ensures idempotency
      delay,
    }
  );
}

export async function rescheduleEmailJob(emailId: string, newScheduledAt: Date) {
  // Try to remove existing job if any
  try {
    const existingJob = await emailQueue.getJob(emailId);
    if (existingJob) {
      await existingJob.remove();
    }
  } catch (err) {
    // Ignore error if job not found
  }

  return await addEmailJob(emailId, newScheduledAt);
}
