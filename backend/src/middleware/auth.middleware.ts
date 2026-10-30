import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  // Also check session.user if Passport serialization is bypassed in any test mode
  if ((req.session as any)?.user) {
    (req as any).user = (req.session as any).user;
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required. Please log in.',
  });
}
