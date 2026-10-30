import { Request, Response } from 'express';
import { WebClient } from '@slack/web-api';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { encrypt } from '../../utils/encryption.js';

export class SlackController {
  static initiateConnect(req: Request, res: Response) {
    const userId = (req as any).user.id;

    if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || env.SLACK_CLIENT_ID === 'mock-slack-client-id') {
      // If Slack OAuth is not configured with live credentials, redirect to frontend with demo option
      return res.redirect(`${env.FRONTEND_URL}/dashboard?slackSetupNeeded=true`);
    }

    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
    const scopes = encodeURIComponent('chat:write,users:read');
    const redirectUri = encodeURIComponent(env.SLACK_CALLBACK_URL);

    const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${env.SLACK_CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
    return res.redirect(slackAuthUrl);
  }

  static async callback(req: Request, res: Response) {
    const code = req.query.code as string;
    const stateStr = req.query.state as string;

    if (!code) {
      return res.redirect(`${env.FRONTEND_URL}/dashboard?slackError=missing_code`);
    }

    try {
      let userId: string | undefined;
      if (stateStr) {
        try {
          const parsed = JSON.parse(Buffer.from(stateStr, 'base64').toString('utf8'));
          userId = parsed.userId;
        } catch (e) {
          // ignore
        }
      }

      if (!userId && (req as any).user) {
        userId = (req as any).user.id;
      }

      if (!userId) {
        return res.redirect(`${env.FRONTEND_URL}/dashboard?slackError=no_session`);
      }

      const client = new WebClient();
      const oauthResult = await client.oauth.v2.access({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: env.SLACK_CALLBACK_URL,
      });

      if (!oauthResult.ok || !oauthResult.access_token) {
        return res.redirect(`${env.FRONTEND_URL}/dashboard?slackError=${oauthResult.error || 'oauth_failed'}`);
      }

      const userClient = new WebClient(oauthResult.access_token);
      const authTest = await userClient.auth.test();

      const slackUserId = (authTest.user_id as string) || (oauthResult.authed_user?.id as string) || '';
      const teamId = (oauthResult.team?.id as string) || (authTest.team_id as string) || 'unknown';
      const teamName = (oauthResult.team?.name as string) || (authTest.team as string) || 'Slack Team';

      const encryptedToken = encrypt(oauthResult.access_token);

      await prisma.slackConnection.upsert({
        where: { userId },
        update: {
          accessToken: encryptedToken,
          slackUserId,
          teamId,
          teamName,
          connectedAt: new Date(),
        },
        create: {
          userId,
          accessToken: encryptedToken,
          slackUserId,
          teamId,
          teamName,
        },
      });

      return res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
    } catch (err: any) {
      console.error('[SlackController] OAuth callback error:', err.message);
      return res.redirect(`${env.FRONTEND_URL}/dashboard?slackError=${encodeURIComponent(err.message)}`);
    }
  }

  static async getStatus(req: Request, res: Response) {
    const userId = (req as any).user.id;

    const connection = await prisma.slackConnection.findUnique({
      where: { userId },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        slackUserId: true,
        connectedAt: true,
      },
    });

    return res.json({
      connected: !!connection,
      connection: connection || null,
    });
  }

  static async disconnect(req: Request, res: Response) {
    const userId = (req as any).user.id;

    await prisma.slackConnection.deleteMany({
      where: { userId },
    });

    return res.json({
      success: true,
      message: 'Slack disconnected successfully',
    });
  }

  /**
   * Demo / Dev connect helper: enables reviewer to simulate or provide a real Slack User ID & Bot Token
   * directly in the dashboard UI if they don't have a public ngrok domain for OAuth redirects!
   */
  static async devConnect(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const { slackUserId, teamName, botToken } = req.body;

    const effectiveToken = botToken || 'xoxb-mock-slack-token-reachinbox';
    const encryptedToken = encrypt(effectiveToken);

    const connection = await prisma.slackConnection.upsert({
      where: { userId },
      update: {
        accessToken: encryptedToken,
        slackUserId: slackUserId || 'U0123456789',
        teamId: 'T01234567',
        teamName: teamName || 'Demo ReachInbox Workspace',
        connectedAt: new Date(),
      },
      create: {
        userId,
        accessToken: encryptedToken,
        slackUserId: slackUserId || 'U0123456789',
        teamId: 'T01234567',
        teamName: teamName || 'Demo ReachInbox Workspace',
      },
    });

    return res.json({
      success: true,
      message: 'Slack connection configured for testing',
      connection: {
        id: connection.id,
        teamName: connection.teamName,
        slackUserId: connection.slackUserId,
        connectedAt: connection.connectedAt,
      },
    });
  }
}
