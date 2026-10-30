import { esClient, EMAIL_INDEX_NAME } from '../config/elasticsearch.js';
import { prisma } from '../database/prisma.js';

export interface EmailSearchDoc {
  emailId: string;
  userId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  createdAt: string;
}

export class SearchService {
  /**
   * Index an email document into Elasticsearch.
   */
  static async indexEmail(doc: EmailSearchDoc): Promise<void> {
    try {
      await esClient.index({
        index: EMAIL_INDEX_NAME,
        id: doc.emailId,
        document: doc,
      });
    } catch (err: any) {
      console.warn(`[SearchService] Indexing email ${doc.emailId} failed (non-blocking): ${err.message}`);
    }
  }

  /**
   * Update status and sentAt in Elasticsearch.
   */
  static async updateEmailStatus(emailId: string, status: string, sentAt?: Date | null): Promise<void> {
    try {
      await esClient.update({
        index: EMAIL_INDEX_NAME,
        id: emailId,
        doc: {
          status,
          sentAt: sentAt ? sentAt.toISOString() : null,
        },
      });
    } catch (err: any) {
      console.warn(`[SearchService] Updating email ${emailId} failed (non-blocking): ${err.message}`);
    }
  }

  /**
   * Search emails for a specific user by query string (recipientEmail, subject, status).
   * Supports pagination.
   */
  static async searchEmails(userId: string, query: string, page: number = 1, limit: number = 20) {
    const from = (page - 1) * limit;

    try {
      const response = await esClient.search({
        index: EMAIL_INDEX_NAME,
        from,
        size: limit,
        query: {
          bool: {
            must: [
              { term: { userId } },
              {
                multi_match: {
                  query,
                  fields: ['recipientEmail^3', 'subject^2', 'status'],
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }],
      });

      const total = typeof response.hits.total === 'number' 
        ? response.hits.total 
        : response.hits.total?.value || 0;

      const emailIds = response.hits.hits.map((hit) => hit._id as string);

      // Hydrate with full PostgreSQL records to include body, sender, etc.
      const emails = await prisma.email.findMany({
        where: { id: { in: emailIds }, userId },
        include: { sender: true },
        orderBy: { scheduledAt: 'desc' },
      });

      return {
        data: emails,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err: any) {
      console.warn(`[SearchService] Elasticsearch query failed, falling back to PostgreSQL: ${err.message}`);

      // Graceful fallback to PostgreSQL ILIKE
      const [total, emails] = await Promise.all([
        prisma.email.count({
          where: {
            userId,
            OR: [
              { recipientEmail: { contains: query, mode: 'insensitive' } },
              { subject: { contains: query, mode: 'insensitive' } },
            ],
          },
        }),
        prisma.email.findMany({
          where: {
            userId,
            OR: [
              { recipientEmail: { contains: query, mode: 'insensitive' } },
              { subject: { contains: query, mode: 'insensitive' } },
            ],
          },
          include: { sender: true },
          skip: from,
          take: limit,
          orderBy: { scheduledAt: 'desc' },
        }),
      ]);

      return {
        data: emails,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }
  }
}
