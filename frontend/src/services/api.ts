import { User, Sender, Email, PaginatedResponse, SlackConnection } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // sends express-session cookie
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP ${response.status}: Request failed`);
  }

  return data as T;
}

export const api = {
  // Auth
  getMe: () => request<{ authenticated: boolean; user: User }>('/auth/me'),
  devLogin: (email?: string, name?: string) =>
    request<{ success: boolean; user: User }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    }),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  // Senders
  getSenders: () => request<{ success: boolean; senders: Sender[] }>('/api/senders'),
  createSender: (data: Partial<Sender>) =>
    request<{ success: boolean; sender: Sender }>('/api/senders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Emails
  getScheduled: (page = 1, limit = 20) =>
    request<PaginatedResponse<Email>>(`/api/emails/scheduled?page=${page}&limit=${limit}`),
  getSent: (page = 1, limit = 20) =>
    request<PaginatedResponse<Email>>(`/api/emails/sent?page=${page}&limit=${limit}`),
  search: (query: string, page = 1, limit = 20) =>
    request<PaginatedResponse<Email>>(`/api/emails/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),
  scheduleEmails: (payload: {
    recipients: string[];
    subject: string;
    body: string;
    senderId?: string;
    startTime?: string;
    delayBetweenEmailsMs?: number;
    idempotencyKey?: string;
  }) =>
    request<{
      success: boolean;
      count: number;
      effectiveDelayMs: number;
      firstScheduledAt: string;
      lastScheduledAt: string;
      emails: Email[];
    }>('/api/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Slack
  getSlackStatus: () =>
    request<{ connected: boolean; connection: SlackConnection | null }>('/api/slack/status'),
  disconnectSlack: () =>
    request<{ success: boolean; message: string }>('/api/slack/disconnect', { method: 'POST' }),
  devConnectSlack: (payload: { slackUserId: string; teamName: string; botToken?: string }) =>
    request<{ success: boolean; connection: SlackConnection }>('/api/slack/dev-connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
