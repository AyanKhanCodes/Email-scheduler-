import express from 'express';
import cors from 'cors';
import session from 'express-session';
import RedisStore from 'connect-redis';
import passport from 'passport';
import { env } from './config/env.js';
import { redisClient } from './config/redis.js';
import routes from './routes/index.js';
import { serverAdapter } from './queues/bullboard.js';
import { errorHandler } from './middleware/error.middleware.js';
import { requireAuth } from './middleware/auth.middleware.js';

export function createApp() {
  const app = express();

  // CORS Configuration
  app.use(
    cors({
      origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Redis Session Store
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'reachinbox:sess:',
  });

  app.use(
    session({
      store: redisStore,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'lax',
      },
    })
  );

  // Passport Auth
  app.use(passport.initialize());
  app.use(passport.session());

  // Bull Board Queue Dashboard (Protected by authentication)
  app.use(
    '/admin/queues',
    (req, res, next) => {
      // In development mode, allow easy viewing; requireAuth in production
      if (env.NODE_ENV === 'development') {
        return next();
      }
      return requireAuth(req, res, next);
    },
    serverAdapter.getRouter()
  );

  // Mount API Routes
  app.use(routes);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
