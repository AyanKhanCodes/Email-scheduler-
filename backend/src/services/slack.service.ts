import { WebClient } from '@slack/web-api';
import { prisma } from '../database/prisma.js';
import { decrypt } from '../utils/encryption.js';

export class SlackService {
  /**
   * Send hourly rate limit reached notification to the user's Slack DM.
   * Deduplicates per (senderId, hourWindow, 'HOURLY_LIMIT_REACHED').
   */
  static async notifyHourlyLimitReached(params: {
    userId: string;
    senderId: string;
    senderEmail: string;
    hourlyLimit: number;
    hourWindow: string;
    rescheduledTime: Date;
  }): Promise<boolean> {
    const { userId, senderId, senderEmail, hourlyLimit, hourWindow, rescheduledTime } = params;

    try {
      // 1. Check if a notification has already been sent for this sender and hour window
      const existingLog = await prisma.notificationLog.findUnique({
        where: {
          senderId_hourWindow_notificationType: {
            senderId,
            hourWindow,
            notificationType: 'HOURLY_LIMIT_REACHED',
          },
        },
      });

      if (existingLog) {
        // Notification already sent for this window, skip to prevent spam
        return false;
      }

      // 2. Check if the user has an active Slack connection
      const connection = await prisma.slackConnection.findUnique({
        where: { userId },
      });

      if (!connection) {
        // No Slack connection, skip gracefully without interrupting email flow
        return false;
      }

      // 3. Decrypt access token and initialize Slack WebClient
      const accessToken = decrypt(connection.accessToken);
      const slackClient = new WebClient(accessToken);

      const messageText = `*Email sending limit reached!*\n\n` +
        `*Sender:* ${senderEmail}\n` +
        `*Hourly limit:* ${hourlyLimit} emails\n` +
        `*Hour Window:* ${hourWindow}\n` +
        `Current hour limit has been reached.\n\n` +
        `Remaining emails have been rescheduled to start at *${rescheduledTime.toISOString()}*.`;

      // 4. Send Slack DM using chat.postMessage to the user's slackUserId
      await slackClient.chat.postMessage({
        channel: connection.slackUserId,
        text: messageText,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ Email Sending Limit Reached',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Sender:*\n${senderEmail}`,
              },
              {
                type: 'mrkdwn',
                text: `*Hourly Limit:*\n${hourlyLimit} emails/hr`,
              },
              {
                type: 'mrkdwn',
                text: `*Hour Window:*\n${hourWindow} (UTC)`,
              },
              {
                type: 'mrkdwn',
                text: `*Rescheduled Delivery:*\n${rescheduledTime.toISOString()}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Remaining pending emails have been safely rescheduled into the next available hour window. No jobs were lost.',
            },
          },
        ],
      });

      // 5. Record the notification in NotificationLog for deduplication
      await prisma.notificationLog.create({
        data: {
          senderId,
          hourWindow,
          notificationType: 'HOURLY_LIMIT_REACHED',
        },
      });

      console.log(`[SlackService] Sent limit notification to Slack for sender ${senderEmail}`);
      return true;
    } catch (err: any) {
      console.error(`[SlackService] Failed to send Slack notification: ${err.message}`);
      return false;
    }
  }
}
