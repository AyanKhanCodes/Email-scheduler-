import { z } from 'zod';
import { env } from '../../config/env.js';

export const scheduleEmailSchema = z.object({
  recipients: z.array(z.string().email('Invalid recipient email format')).min(1, 'At least one recipient is required'),
  subject: z.string().min(1, 'Subject is required').max(255),
  body: z.string().min(1, 'Email body is required'),
  senderId: z.string().optional(),
  startTime: z.string().datetime().optional(), // ISO string
  delayBetweenEmailsMs: z.number().int().min(env.MIN_DELAY_BETWEEN_EMAILS_MS, `Minimum delay must be at least ${env.MIN_DELAY_BETWEEN_EMAILS_MS}ms`).optional(),
  idempotencyKey: z.string().optional(),
});

export type ScheduleEmailInput = z.infer<typeof scheduleEmailSchema>;
