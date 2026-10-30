# ReachInbox — Full-Stack Asynchronous Email Job Scheduler

A production-grade, distributed email scheduling service and real-time dashboard built with Node.js, TypeScript, Express, BullMQ, Redis, PostgreSQL (Prisma ORM), Elasticsearch, Nodemailer (Ethereal SMTP), and React.

---

## 📑 Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Key Engineering Highlights](#key-engineering-highlights)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Prerequisites & Quickstart](#prerequisites--quickstart)
6. [Environment Configuration](#environment-configuration)
7. [Deep-Dive Architecture & Core Systems](#deep-dive-architecture--core-systems)
   - [BullMQ Delayed Job Scheduling](#1-bullmq-delayed-job-scheduling-no-crons)
   - [Persistence & Worker Restart Recovery](#2-persistence--worker-restart-recovery)
   - [Distributed Concurrency & Minimum Send Delay](#3-distributed-concurrency--minimum-send-delay)
   - [Per-Sender Hourly Rate Limiting & Atomic Lua Scripts](#4-per-sender-hourly-rate-limiting--atomic-lua-scripts)
   - [Slack OAuth & Rate-Limit Notifications](#5-slack-oauth--rate-limit-notifications)
   - [Elasticsearch Full-Text Search with Graceful Fallback](#6-elasticsearch-full-text-search)
   - [Ethereal SMTP & Preview Delivery](#7-ethereal-smtp--preview-delivery)
8. [API Endpoints Reference](#api-endpoints-reference)
9. [Frontend Application](#frontend-application)
10. [End-to-End Validation & Testing](#end-to-end-validation--testing)
11. [Completed Requirements Checklist](#completed-requirements-checklist)

---

## Architectural Overview

```
                      +-----------------------------+
                      |   React + Vite Dashboard    |
                      |   (Scheduled & Sent Views)  |
                      +--------------+--------------+
                                     |  HTTP REST / Cookies
                                     v
                      +-----------------------------+
                      |     Express.js API Layer    |
                      |   (Validation, Auth, CORS)  |
                      +------+---------------+------+
                             |               |
                PostgreSQL   |               |   Redis
             (Prisma Source  |               |  (BullMQ Delayed Jobs
                of Truth)    |               |   & Atomic Counters)
                             v               v
             +---------------+--+      +-----+---------------+
             |   PostgreSQL     |      |   BullMQ Queue      |
             |   Database       |      |   & Redis Cluster   |
             +------------------+      +-----+---------------+
                                             |
                                             | Distributes Jobs
                                             v
                      +-----------------------------+
                      |    BullMQ Concurrency Worker|
                      | (Concurrency: 5, Spacing)   |
                      +------+---------------+------+
                             |               |
               Ethereal SMTP |               | Web API / Slack DM
              Delivery       v               v
              +--------------+--+      +-----+---------------+
              |  Ethereal SMTP  |      |   Slack Webhook /   |
              |  Fake Provider  |      |   Bot Notification  |
              +-----------------+      +---------------------+
                             |
                             | Indexes Updates (Non-blocking)
                             v
                      +-----------------+
                      |  Elasticsearch  |
                      |  Cluster (9200) |
                      +-----------------+
```

---

## Key Engineering Highlights

1. **Zero-Cron Architecture**: Entirely free of OS cron jobs, `node-cron`, or polling schedulers. Uses Redis-backed BullMQ delayed job queues.
2. **Persistence & Restart Recovery**: Redis runs with `--appendonly yes`. If workers or API servers restart, all pending delayed jobs are automatically recovered without duplicates.
3. **Idempotency Guarantees**: Stable BullMQ `jobId = email.id`, request-level idempotency keys, and conditional database state transitions prevent duplicate sends.
4. **Distributed Minimum Send Spacing**: Coordinated across multiple workers via atomic Redis slot reservations (`sender-next-slot:{senderId}`), avoiding in-memory local timer bugs.
5. **Atomic Hourly Rate Limiting**: Redis Lua script (`email-rate:{senderId}:{hourWindow}`) atomically tracks capacity. When a sender's limit is hit, jobs are rescheduled into the next hour window (`nextHour`) without dropping a single email.
6. **Real Slack Notifications**: Alerts authorizing users via Slack Direct Message (`chat.postMessage`) when hourly limits are reached, with duplicate notification suppression per hour window.
7. **Elasticsearch Integration**: Instant search across recipient, subject, and status with automatic fallback to PostgreSQL if Elasticsearch is temporarily unavailable.

---

## Technology Stack

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Node.js | v20+ | Backend JavaScript runtime |
| Language | TypeScript | 5.4+ | Strict type safety across client and server |
| Backend Framework | Express.js | 4.19+ | REST API & session middleware |
| Database | PostgreSQL | 16-alpine | Primary persistent relational source of truth |
| ORM | Prisma ORM | 5.14+ | Schema definitions, migrations, and type-safe queries |
| Queue / Scheduling | BullMQ | 5.7+ | Persistent delayed job queue & worker coordination |
| In-Memory Cache | Redis | 7-alpine | Queue state, atomic Lua scripts, distributed rate limits |
| Search Engine | Elasticsearch | 8.11+ | Full-text indexing and fuzzy email search |
| Email Transport | Nodemailer + Ethereal | 6.9+ | Test SMTP delivery and message preview URLs |
| Queue Monitoring | Bull Board | 5.17+ | Real-time queue visualizer dashboard |
| Frontend | React + Vite | 18.3+ | Fast client dashboard with Tailwind CSS |
| CSV Parsing | Papa Parse | 5.4+ | Client-side recipient CSV parsing & validation |

---

## Project Structure

```
fs_email_sch/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma           # Prisma models (User, Sender, Email, SlackConnection, NotificationLog)
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts              # Zod-validated environment configuration
│   │   │   ├── redis.ts            # ioredis client setup
│   │   │   ├── elasticsearch.ts    # Elasticsearch client & index mappings
│   │   │   └── nodemailer.ts       # Ethereal SMTP transporter & auto-account generator
│   │   ├── database/
│   │   │   └── prisma.ts           # Singleton Prisma client
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts  # Session & Passport authentication guard
│   │   │   ├── validate.middleware.ts # Zod request validator
│   │   │   └── error.middleware.ts # Global JSON error handler
│   │   ├── modules/
│   │   │   ├── auth/               # Google OAuth & Dev Login endpoints
│   │   │   ├── emails/             # Scheduling & listing controllers
│   │   │   ├── senders/            # Sender identity & limits management
│   │   │   ├── slack/              # Slack OAuth & Dev Connect controllers
│   │   │   └── search/             # Elasticsearch search controller
│   │   ├── queues/
│   │   │   ├── email.queue.ts      # BullMQ queue & delayed job helper
│   │   │   └── bullboard.ts        # Bull Board UI integration (/admin/queues)
│   │   ├── services/
│   │   │   ├── rate-limiter.service.ts # Redis Lua atomic rate limiting & spacing
│   │   │   ├── search.service.ts   # Elasticsearch document indexing & querying
│   │   │   └── slack.service.ts    # Slack WebClient notification & deduplication
│   │   ├── utils/
│   │   │   ├── encryption.ts       # AES-256-GCM cipher for OAuth tokens
│   │   │   └── time.ts             # UTC hour window & delay calculators
│   │   ├── workers/
│   │   │   └── email.worker.ts     # BullMQ concurrency worker (concurrency: 5)
│   │   ├── app.ts                  # Express application setup
│   │   ├── server.ts               # Server entry point
│   │   └── test-e2e.ts             # Comprehensive automated test suite
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/             # Reusable UI components
│   │   ├── features/
│   │   │   ├── auth/               # AuthContext & Session management
│   │   │   ├── compose/            # ComposeModal with Papa Parse CSV parsing
│   │   │   ├── scheduled-emails/   # ScheduledEmailsTable with pagination
│   │   │   ├── sent-emails/        # SentEmailsTable with delivery status
│   │   │   └── slack/              # SlackModal for OAuth / direct connection
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx       # Google Sign-in & Instant Demo Login
│   │   │   └── DashboardPage.tsx   # Main responsive dashboard with 10s auto-polling
│   │   ├── services/
│   │   │   └── api.ts              # Typed fetch client with credentials
│   │   └── types/
│   │       └── index.ts            # Shared TypeScript domain models
│   ├── .env.example
│   └── package.json
├── docker-compose.yml              # PostgreSQL, Redis, and Elasticsearch containers
├── implementation.md               # Architecture specification & plan
└── README.md
```

---

## Prerequisites & Quickstart

### 1. Prerequisites
- **Node.js**: v20+
- **npm**: v10+
- **Docker Desktop**: Running

### 2. Start Infrastructure Containers
In the project root directory, launch PostgreSQL, Redis, and Elasticsearch:
```bash
docker compose up -d
```
Verify all 3 containers are healthy:
```bash
docker ps
```
- `reachinbox-postgres` (Port 5432)
- `reachinbox-redis` (Port 6379)
- `reachinbox-elasticsearch` (Port 9200)

### 3. Start the Backend API & Worker
```bash
cd backend
npm install
npx prisma db push
npm run dev
```
The backend initializes:
- Database schema and foreign keys
- Elasticsearch `emails` index mappings
- Ethereal SMTP test account
- BullMQ worker with concurrency: 5
- Server listening on `http://localhost:5001`
- Bull Board queue visualizer on `http://localhost:5001/admin/queues`

### 4. Start the Frontend Dashboard
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## Environment Configuration

### Backend (`backend/.env`)

```ini
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/reachinbox?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_URL=http://localhost:9200
PORT=5001
NODE_ENV=development

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5001/auth/google/callback

# Slack OAuth 2.0
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_CALLBACK_URL=http://localhost:5001/api/slack/callback

# Ethereal SMTP (Leave blank to auto-generate temporary accounts on startup)
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=
ETHEREAL_PASS=

# Engine Concurrency & Rate Limits
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200

# Security Keys
SESSION_SECRET=reachinbox-session-secret-key-change-in-production
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
FRONTEND_URL=http://localhost:5173
```

### Frontend (`frontend/.env`)

```ini
VITE_API_BASE_URL=http://localhost:5001
```

---

## Deep-Dive Architecture & Core Systems

### 1. BullMQ Delayed Job Scheduling (No Crons)
- **Zero Crons**: Schedulers relying on `node-cron` or interval loops break down under worker restarts or multi-instance clustering.
- BullMQ stores delayed jobs as Redis sorted sets scored by execution timestamp (`scheduledAt.getTime()`).
- When execution time arrives, Redis atomically moves jobs into the active queue.
- Pre-spaced batch delays: When scheduling 10 recipients with a 2,000ms delay starting at `T`, jobs are added with staggered timestamps: `T`, `T + 2s`, `T + 4s`, etc.

### 2. Persistence & Worker Restart Recovery
- **Redis Persistence**: Redis is started with `--appendonly yes`, saving job states to disk.
- **Worker Resumption**: When workers terminate and restart, BullMQ reconnects to the existing Redis instance and resumes delayed jobs exactly where they left off.
- **Idempotency Check**: When a worker picks up a job, it checks the database record for `email.status === 'sent'`. If already delivered, it immediately acknowledges and exits without re-sending.

### 3. Distributed Concurrency & Minimum Send Delay
- Concurrency is configured via `WORKER_CONCURRENCY` (default: 5 parallel jobs per worker process).
- **Three-Tier Delay Hierarchy**:
  1. System Floor: `MIN_DELAY_BETWEEN_EMAILS_MS=2000` (cannot be bypassed).
  2. Sender Default: `sender.minimumDelay` in PostgreSQL.
  3. Batch Override: User-selected delay at compose time (validated `>= max(floor, sender default)`).
- **Redis Distributed Spacing**:
  Uses an atomic Lua script on key `sender-next-slot:{senderId}`. If two workers attempt to send for the same sender simultaneously, the second worker receives the exact millisecond offset to wait before initiating SMTP transport.

### 4. Per-Sender Hourly Rate Limiting & Atomic Lua Scripts
- Senders have individual `hourlyLimit` fields in PostgreSQL, capped by the system ceiling `MAX_EMAILS_PER_HOUR_PER_SENDER`.
- Counter key: `email-rate:{senderId}:{hourWindow}` (e.g. `email-rate:sender-uuid:2026-10-31-02`).
- Atomic Lua Script checks if `currentCount >= limit`:
  - **Within Limit**: Increments counter, sets 2-hour TTL, and allows delivery.
  - **Limit Reached**: Does **not** drop or fail the job. Instead, it:
    1. Reschedules the BullMQ job to the start of the next hour window (`nextHourDate`).
    2. Updates `scheduledAt` in PostgreSQL and Elasticsearch.
    3. Triggers an automated Slack rate-limit notification.

### 5. Slack OAuth & Rate-Limit Notifications
- Users connect their workspace via Slack OAuth 2.0 (`chat:write,users:read`).
- Access tokens are encrypted at rest with AES-256-GCM using `ENCRYPTION_KEY`.
- Notifications are sent via `@slack/web-api` `chat.postMessage` directly to the authorizing user's `slackUserId` (DM).
- **Deduplication**: Recorded in the `NotificationLog` table with a unique constraint on `(senderId, hourWindow, notificationType)` to prevent duplicate notification spam.

### 6. Elasticsearch Full-Text Search
- Emails are indexed asynchronously in Elasticsearch index `emails` upon scheduling and delivery.
- Indexed fields: `emailId`, `userId`, `senderId`, `recipientEmail`, `subject`, `status`, `scheduledAt`, `sentAt`, `createdAt`.
- Multi-match fuzzy search supports querying across recipient, subject, and status.
- **Graceful Fallback**: If Elasticsearch is offline or down, queries seamlessly fall back to PostgreSQL `ILIKE` without breaking the dashboard UI.

### 7. Ethereal SMTP & Preview Delivery
- Delivered via Nodemailer to Ethereal Email (`smtp.ethereal.email`).
- If no credentials are provided in `.env`, a fresh temporary test account is auto-provisioned on startup.
- Message preview URLs (`https://ethereal.email/message/...`) are logged to the console for live message inspection.

---

## API Endpoints Reference

### Authentication
- `GET /auth/google` — Initiates Google OAuth 2.0 consent flow.
- `GET /auth/google/callback` — Google OAuth redirect callback.
- `POST /auth/dev-login` — Instant demo login (creates/authenticates test engineer user).
- `GET /auth/me` — Returns current authenticated user and Slack connection status.
- `POST /auth/logout` — Destroys session and clears cookies.

### System & Health
- `GET /health` — Returns status of PostgreSQL, Redis, and Elasticsearch (`healthy`/`degraded`).
- `GET /admin/queues` — Interactive Bull Board dashboard for queue jobs and delayed states.

### Senders
- `GET /api/senders` — List sender identities for the authenticated user.
- `POST /api/senders` — Create new sender with custom `hourlyLimit` and `minimumDelay`.
- `PUT /api/senders/:id` — Update sender configuration.

### Email Scheduling & Listing
- `POST /api/emails/schedule` — Schedules email batch with validation, deduplication, and staggered BullMQ jobs.
- `GET /api/emails/scheduled?page=1&limit=20` — List pending and processing delayed emails.
- `GET /api/emails/sent?page=1&limit=20` — List successfully delivered and failed emails.
- `GET /api/emails/:id` — Get detailed record for a specific email.
- `GET /api/emails/search?q=...&page=1&limit=20` — Full-text Elasticsearch search.

### Slack Integration
- `GET /api/slack/connect` — Initiates Slack OAuth connection.
- `GET /api/slack/callback` — Exchanges code for encrypted access token.
- `GET /api/slack/status` — Returns active Slack connection state.
- `POST /api/slack/disconnect` — Disconnects and removes stored credentials.
- `POST /api/slack/dev-connect` — Connects testing Slack user ID and bot token.

---

## Frontend Application

The dashboard is accessible at **`http://localhost:5173`**.

- **Authentication**: Google OAuth sign-in and Instant Demo button.
- **Header**: Live Slack connection indicator, Bull Board queue link, user avatar, and logout.
- **Real-Time Polling**: Auto-refreshes email states every 10 seconds.
- **Compose Modal**:
  - Drag-and-drop or file upload for recipient CSV/text files parsed via Papa Parse.
  - Live count of detected valid emails.
  - Custom sender selection, start time picker, and minimum send delay configuration.
- **Scheduled Emails Tab**: Live badges for `scheduled` and `processing` states with pagination.
- **Sent Emails Tab**: Displays delivery timestamp, recipient, subject, and status.
- **Global Search**: Instant debounce search querying Elasticsearch.

---

## End-to-End Validation & Testing

Run the automated integration suite:
```bash
cd backend
npx tsx src/test-e2e.ts
```

Output:
```
======================================================
🧪 RUNNING REACHINBOX END-TO-END VALIDATION SUITE
======================================================

1️⃣  Testing Health Check Endpoint...
   ✅ Health Check passed: { database: 'healthy', redis: 'healthy', elasticsearch: 'healthy' }

2️⃣  Testing Authentication & Session Persistence...
   ✅ Dev Login passed for user: e2e.engineer@reachinbox.ai
   ✅ Session Cookie verification passed with GET /auth/me

3️⃣  Testing Sender Creation & Rate Limit Configuration...
   ✅ Sender created with hourlyLimit=2, minimumDelay=2000ms

4️⃣  Testing Idempotency Key Handling...
   First call returned 1 email(s)
   ✅ Idempotency replay recognized! No duplicate jobs created.

5️⃣  Testing Elasticsearch Search API...
   ✅ Elasticsearch successfully matched emails for query

6️⃣  Testing Slack Connection & Disconnect Lifecycle...
   ✅ Slack connected successfully
   ✅ Slack status confirmed active
   ✅ Slack disconnected successfully

======================================================
🎉 ALL REACHINBOX END-TO-END VALIDATIONS PASSED!
======================================================
```

---

## Completed Requirements Checklist

- [x] **Backend Infrastructure**: Node.js, TypeScript, Express, PostgreSQL, Prisma ORM, Redis, BullMQ, Elasticsearch.
- [x] **Zero Crons**: 100% powered by BullMQ delayed jobs and Redis sorted sets.
- [x] **Persistence & Restart Recovery**: Delayed jobs maintained in Redis (`--appendonly yes`) and recovered upon worker restart.
- [x] **Idempotency**: Unique database keys, stable BullMQ job IDs (`jobId = email.id`), and status pre-flight checks.
- [x] **Worker Concurrency**: Configurable parallel job workers (`WORKER_CONCURRENCY=5`).
- [x] **Minimum Send Delay**: Coordinated across workers via atomic Redis slot reservations.
- [x] **Per-Sender Hourly Rate Limiting**: Atomic Lua scripts reschedule excess emails into the next hour window without dropping jobs.
- [x] **Slack Integration**: OAuth 2.0 flow, AES-256-GCM token encryption, rate-limit alerts via `chat.postMessage`, and deduplication logging.
- [x] **Ethereal SMTP**: Nodemailer delivery with test message preview URLs.
- [x] **Elasticsearch**: Document indexing on schedule and status update, fuzzy multi-match search with PostgreSQL fallback.
- [x] **Bull Board UI**: Mounted at `/admin/queues` for live job inspection.
- [x] **Frontend Dashboard**: React, Vite, TypeScript, Tailwind CSS, Papa Parse CSV parsing, Scheduled and Sent tables with 10s auto-refresh polling.
