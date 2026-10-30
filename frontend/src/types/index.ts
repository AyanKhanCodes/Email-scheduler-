export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  slackConnection?: SlackConnection | null;
}

export interface Sender {
  id: string;
  userId: string;
  name: string;
  email: string;
  hourlyLimit: number;
  minimumDelay: number;
}

export interface Email {
  id: string;
  userId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatus;
  failureReason?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: Sender;
}

export interface SlackConnection {
  id: string;
  teamName: string;
  slackUserId: string;
  connectedAt: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
