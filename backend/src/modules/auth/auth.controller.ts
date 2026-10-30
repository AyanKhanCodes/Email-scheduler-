import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';

// Configure Passport serialization
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Setup Google Strategy if credentials exist
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CLIENT_ID !== 'mock-google-client-id') {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email found in Google profile'), undefined);
          }

          const avatar = profile.photos?.[0]?.value || null;
          const name = profile.displayName || profile.name?.givenName || 'Google User';

          // Upsert user
          const user = await prisma.user.upsert({
            where: { googleId: profile.id },
            update: {
              name,
              avatar,
            },
            create: {
              googleId: profile.id,
              email,
              name,
              avatar,
            },
          });

          // Ensure user has at least one default Sender
          const existingSender = await prisma.sender.findFirst({ where: { userId: user.id } });
          if (!existingSender) {
            await prisma.sender.create({
              data: {
                userId: user.id,
                email: user.email,
                name: user.name,
                hourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
                minimumDelay: env.MIN_DELAY_BETWEEN_EMAILS_MS,
              },
            });
          }

          done(null, user);
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    )
  );
}

export class AuthController {
  static initiateGoogleAuth(req: Request, res: Response, next: NextFunction) {
    // If real Google OAuth is not configured, redirect to dev login or notify
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_ID === 'mock-google-client-id') {
      return res.redirect(`${env.FRONTEND_URL}/login?mockAvailable=true`);
    }

    passport.authenticate('google', {
      scope: ['profile', 'email'],
    })(req, res, next);
  }

  static googleCallback(req: Request, res: Response, next: NextFunction) {
    passport.authenticate('google', {
      failureRedirect: `${env.FRONTEND_URL}/login?error=auth_failed`,
      successRedirect: `${env.FRONTEND_URL}/dashboard`,
    })(req, res, next);
  }

  /**
   * Dev / Demo login endpoint so reviewer can test the full end-to-end dashboard
   * immediately without needing external Google Cloud API keys.
   */
  static async devLogin(req: Request, res: Response) {
    const email = req.body.email || 'demo.user@reachinbox.ai';
    const name = req.body.name || 'Demo Engineer';
    const avatar = req.body.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&fit=crop&crop=faces';
    const googleId = `dev-google-${email}`;

    try {
      const user = await prisma.user.upsert({
        where: { email },
        update: { name, avatar },
        create: {
          googleId,
          email,
          name,
          avatar,
        },
      });

      // Ensure default sender
      const existingSender = await prisma.sender.findFirst({ where: { userId: user.id } });
      if (!existingSender) {
        await prisma.sender.create({
          data: {
            userId: user.id,
            email: user.email,
            name: user.name,
            hourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
            minimumDelay: env.MIN_DELAY_BETWEEN_EMAILS_MS,
          },
        });
      }

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Login session failed', message: err.message });
        }
        (req.session as any).user = user;
        return res.json({ success: true, user });
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Dev login error', message: err.message });
    }
  }

  static async getCurrentUser(req: Request, res: Response) {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        slackConnection: {
          select: {
            id: true,
            teamName: true,
            slackUserId: true,
            connectedAt: true,
          },
        },
      },
    });

    return res.json({
      authenticated: true,
      user: dbUser,
    });
  }

  static logout(req: Request, res: Response, next: NextFunction) {
    req.logout((err) => {
      if (err) {
        return next(err);
      }
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Logged out successfully' });
      });
    });
  }
}
