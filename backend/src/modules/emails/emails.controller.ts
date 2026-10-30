import { Request, Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { scheduleEmailSchema } from './emails.schema.js';
import { RateLimiterService } from '../../services/rate-limiter.service.js';
import { addEmailJob } from '../../queues/email.queue.js';
import { SearchService } from '../../services/search.service.js';

export class EmailsController {
  static async schedule(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const data = scheduleEmailSchema.parse(req.body);

    // 1. Resolve sender
    let sender = data.senderId
      ? await prisma.sender.findFirst({ where: { id: data.senderId, userId } })
      : await prisma.sender.findFirst({ where: { userId } });

    if (!sender) {
      // Auto-create default sender for this user if none exists
      const user = (req as any).user;
      sender = await prisma.sender.create({
        data: {
          userId,
          email: user.email,
          name: user.name,
        },
      });
    }

    // 2. Check Idempotency Key if provided
    if (data.idempotencyKey) {
      const existingEmails = await prisma.email.findMany({
        where: {
          userId,
          idempotencyKey: {
            startsWith: `${data.idempotencyKey}-`,
          },
        },
        include: { sender: true },
      });

      if (existingEmails.length > 0) {
        return res.json({
          success: true,
          idempotentReplay: true,
          count: existingEmails.length,
          emails: existingEmails,
        });
      }
    }

    // 3. Deduplicate recipients
    const uniqueRecipients = Array.from(new Set(data.recipients.map((r) => r.trim().toLowerCase())));

    // 4. Calculate timing and delay spacing
    const effectiveDelay = RateLimiterService.getEffectiveMinDelay(
      sender.minimumDelay,
      data.delayBetweenEmailsMs
    );

    const now = Date.now();
    const baseStartTime = data.startTime ? new Date(data.startTime).getTime() : now;
    const startTimestamp = Math.max(now, baseStartTime);

    const createdEmails: any[] = [];

    // 5. Create records and queue jobs with staggered execution times
    for (let i = 0; i < uniqueRecipients.length; i++) {
      const recipientEmail = uniqueRecipients[i];
      const scheduledAt = new Date(startTimestamp + i * effectiveDelay);
      const emailIdempotencyKey = data.idempotencyKey
        ? `${data.idempotencyKey}-${recipientEmail}`
        : undefined;

      const email = await prisma.email.create({
        data: {
          userId,
          senderId: sender.id,
          recipientEmail,
          subject: data.subject,
          body: data.body,
          scheduledAt,
          status: 'scheduled',
          idempotencyKey: emailIdempotencyKey,
        },
        include: { sender: true },
      });

      // Add to BullMQ delayed queue
      await addEmailJob(email.id, scheduledAt);

      // Asynchronously index in Elasticsearch
      SearchService.indexEmail({
        emailId: email.id,
        userId: email.userId,
        senderId: email.senderId,
        recipientEmail: email.recipientEmail,
        subject: email.subject,
        status: email.status,
        scheduledAt: email.scheduledAt.toISOString(),
        createdAt: email.createdAt.toISOString(),
      }).catch((err) => console.warn(`[Elasticsearch] Background index failed: ${err.message}`));

      createdEmails.push(email);
    }

    return res.status(201).json({
      success: true,
      count: createdEmails.length,
      effectiveDelayMs: effectiveDelay,
      firstScheduledAt: createdEmails[0]?.scheduledAt,
      lastScheduledAt: createdEmails[createdEmails.length - 1]?.scheduledAt,
      emails: createdEmails,
    });
  }

  static async getScheduled(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = {
      userId,
      status: {
        in: ['scheduled' as const, 'processing' as const],
      },
    };

    const [total, data] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        include: { sender: true },
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    return res.json({
      success: true,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  static async getSent(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = {
      userId,
      status: {
        in: ['sent' as const, 'failed' as const],
      },
    };

    const [total, data] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        include: { sender: true },
        skip,
        take: limit,
        orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);

    return res.json({
      success: true,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  static async getById(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const email = await prisma.email.findFirst({
      where: { id, userId },
      include: { sender: true },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    return res.json({ success: true, email });
  }
}
