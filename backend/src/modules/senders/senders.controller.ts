import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';

export const createSenderSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  hourlyLimit: z.number().int().positive().optional().default(env.MAX_EMAILS_PER_HOUR_PER_SENDER),
  minimumDelay: z.number().int().min(env.MIN_DELAY_BETWEEN_EMAILS_MS).optional().default(env.MIN_DELAY_BETWEEN_EMAILS_MS),
});

export const updateSenderSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  hourlyLimit: z.number().int().positive().optional(),
  minimumDelay: z.number().int().min(env.MIN_DELAY_BETWEEN_EMAILS_MS).optional(),
});

export class SendersController {
  static async listSenders(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const senders = await prisma.sender.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, senders });
  }

  static async createSender(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const data = createSenderSchema.parse(req.body);

    const sender = await prisma.sender.create({
      data: {
        userId,
        name: data.name,
        email: data.email,
        hourlyLimit: data.hourlyLimit,
        minimumDelay: data.minimumDelay,
      },
    });

    res.status(201).json({ success: true, sender });
  }

  static async updateSender(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const data = updateSenderSchema.parse(req.body);

    const existing = await prisma.sender.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const updated = await prisma.sender.update({
      where: { id },
      data,
    });

    res.json({ success: true, sender: updated });
  }
}
