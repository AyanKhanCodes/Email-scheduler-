import { Request, Response } from 'express';
import { SearchService } from '../../services/search.service.js';

export class SearchController {
  static async search(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const query = (req.query.q as string) || '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    if (!query.trim()) {
      return res.json({
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }

    const results = await SearchService.searchEmails(userId, query.trim(), page, limit);
    return res.json({
      success: true,
      ...results,
    });
  }
}
