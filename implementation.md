# ReachInbox — Full-Stack Email Job Scheduler
## Implementation Plan

## 1. Project Objective

Build a production-grade email scheduling service and dashboard that accepts email send requests, stores them persistently, schedules delivery through BullMQ and Redis, sends emails through Ethereal SMTP, and provides real-time visibility into scheduled and sent emails.

The system must demonstrate reliable backend architecture, asynchronous job processing, concurrency management, distributed rate limiting, idempotency, restart recovery, OAuth integrations, and email search.

No cron jobs or cron libraries will be used.

## 2. Final Technology Stack

The following technology choices are finalized for this project.

### Backend

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| TypeScript | Type safety and maintainable backend development |
| Express.js | REST API framework |
| PostgreSQL | Relational database |
| Prisma ORM | Database queries, schema management, and migrations |
| BullMQ | Persistent job scheduling and queue management |
| Redis | Queue storage, distributed coordination, and rate limiting |
| Elasticsearch | Email indexing and search |
| Nodemailer | SMTP email delivery |
| Ethereal Email | Fake SMTP provider for testing |
| Zod | API request and environment validation |
| Passport.js / OAuth libraries | Google authentication integration |

### Frontend

| Technology | Purpose |
|---|---|
| React.js | Frontend UI |
| Vite | Frontend build tool |
| TypeScript | Frontend type safety |
| Tailwind CSS | Styling and responsive UI |
| React Router | Client-side navigation |
| Papa Parse | CSV lead-file parsing |

### Integrations

- Google OAuth 2.0 for authentication.
- Slack OAuth 2.0 for connecting Slack accounts.
- Slack Web API for sending real notifications.
- Ethereal SMTP for test email delivery.

### Infrastructure and Development Tools

- Docker Compose for PostgreSQL, Redis, and Elasticsearch (infrastructure services only — the backend and frontend applications run on the host during development).
- Postman for API testing.
- Git and GitHub for version control.
- Environment variables for application configuration.

## 3. High-Level Architecture

The application will be divided into the following components:

1. Frontend Dashboard — Google login, email composition, scheduled and sent email views, and Slack connection.
2. Express API — Authentication, email scheduling, email listing, search, and Slack OAuth.
3. PostgreSQL — Primary persistent storage for users, senders, email records, and scheduling information.
4. Prisma ORM — Type-safe database access and schema migrations.
5. Redis + BullMQ — Persistent delayed jobs, worker coordination, concurrency, and queue management.
6. BullMQ Worker — Processes scheduled jobs, enforces rate limits, and sends emails.
7. Ethereal SMTP — Handles fake email delivery for testing.
8. Elasticsearch — Indexes email records for searching.
9. Slack Integration — Sends real notifications when hourly sending limits are reached.

PostgreSQL will remain the primary source of truth. Redis will manage queue processing and distributed coordination, while Elasticsearch will provide searchable email records.

## 4. Database Design

The database will use PostgreSQL with Prisma ORM.

### Main database entities

#### User

Stores authenticated user information.

Fields:
- id
- googleId
- name
- email
- avatar
- createdAt
- updatedAt

#### Sender

Stores email sender information and associated configuration.

Fields:
- id
- userId
- email
- name
- hourlyLimit
- minimumDelay
- createdAt
- updatedAt

#### Email

Stores individual email records.

Fields:
- id
- userId
- senderId
- recipientEmail
- subject
- body
- scheduledAt
- sentAt
- status
- failureReason
- idempotencyKey
- createdAt
- updatedAt

Suggested statuses:

- scheduled
- processing
- sent
- failed

#### SlackConnection

Stores Slack OAuth connection information.

Fields:
- id
- userId
- accessToken (encrypted at rest using AES-256-GCM with a key from the `ENCRYPTION_KEY` environment variable)
- slackUserId (obtained from the `auth.test` Slack API response during OAuth callback)
- teamId
- teamName
- connectedAt
- updatedAt

#### NotificationLog

Tracks Slack rate-limit notifications.

Fields:
- id
- senderId
- hourWindow
- notificationType
- sentAt

A unique constraint on senderId, hourWindow, and notificationType can prevent duplicate notifications.

### Database considerations

- Use foreign keys to maintain relational integrity.
- Add indexes to frequently queried fields.
- Use transactions for operations that require multiple database changes.
- Use unique constraints for idempotency.
- Store timestamps consistently in UTC.
- Keep email delivery status synchronized with worker processing.

## 5. Email Scheduling and BullMQ Architecture

### Scheduling flow

1. User logs into the dashboard.
2. User opens Compose New Email.
3. User enters the subject and body.
4. User uploads a CSV or text file containing recipient addresses.
5. The frontend parses the file and displays the number of detected email addresses.
6. User selects the start time, minimum delay, and hourly sending limit.
7. Frontend sends the request to the Express scheduling API.
8. Backend validates the request using Zod.
9. Backend extracts and validates recipient email addresses.
10. Backend creates email records in PostgreSQL.
11. Backend creates BullMQ delayed jobs using stable email IDs.
12. BullMQ makes jobs available when their scheduled execution time arrives.
13. Workers process the jobs.
14. Workers enforce concurrency, send spacing, and hourly rate limits.
15. Nodemailer sends the emails through Ethereal SMTP.
16. PostgreSQL records the delivery result.
17. Elasticsearch indexes the updated email information.
18. Frontend displays the updated email status. The dashboard uses periodic polling (every 10 seconds) to refresh email lists. Real-time push is not required.

### BullMQ delayed jobs

Use BullMQ delayed jobs to schedule emails for their intended execution times.

Do not use:
- OS-level cron.
- node-cron.
- Agenda.
- Any other cron-based scheduler.

The scheduling system must rely on BullMQ and Redis.

### Suggested queue configuration

- Queue name: email-queue
- Job name: send-email
- Job ID: email record ID
- Delay: calculated from scheduledAt and current time.

Use stable job identifiers to prevent duplicate logical jobs.

## 6. Persistence and Restart Recovery

The application must survive server and worker restarts without losing scheduled jobs.

### Implementation strategy

1. PostgreSQL stores all email records and their scheduling information.
2. Redis persistence is enabled for BullMQ queue data.
3. BullMQ maintains delayed jobs in Redis.
4. Workers reconnect to the existing Redis instance after restarting.
5. Do not recreate every job blindly during startup.
6. Reconcile database records and queue jobs where necessary.
7. Use stable job IDs to prevent duplicate jobs.
8. Check the persisted email status before processing a job.
9. Do not resend emails already marked as sent.

### Restart scenario

Example:

- Schedule an email for 10:30 AM.
- Stop the worker at 10:15 AM.
- Restart the worker at 10:25 AM.
- BullMQ recovers the delayed job.
- The email becomes available at its intended execution time.
- Worker processes the email.
- Database records its delivery status.

The system must not restart the scheduling process from the beginning.

### Idempotency

Idempotency is critical because queue jobs may be retried or recovered.

Implementation:

- Assign every email a unique database ID.
- Use that ID as the BullMQ job ID.
- Use unique idempotency keys for scheduling requests.
- Check email status before sending.
- Use conditional database updates to prevent multiple workers from claiming the same email.
- Ensure a successfully sent email is never intentionally sent again.

Important: SMTP delivery and database updates cannot be made one atomic transaction. A crash after SMTP accepts an email but before PostgreSQL records success creates an ambiguous delivery state. Document this limitation and use a sending state, provider message identifiers where available, and reconciliation rather than claiming exactly-once delivery.

## 7. Worker Concurrency and Send Delay

### Configurable worker concurrency

BullMQ worker concurrency must be configurable through environment variables.

Example:

WORKER_CONCURRENCY=5

The worker must support parallel job processing without violating sender-specific limits.

### Minimum delay between emails

Implement a configurable minimum delay between individual email sends.

There are three sources for the minimum delay, applied in the following precedence order:

1. **System-wide floor** (environment variable): `MIN_DELAY_BETWEEN_EMAILS_MS=2000`. This is the absolute minimum gap the system will ever enforce. No sender or user can set a lower value.
2. **Sender-level default** (database field): Each Sender's `minimumDelay` field sets the default for that sender. This value must be greater than or equal to the system-wide floor.
3. **User compose-time selection**: When composing an email batch, the user may specify a delay. The backend must validate that this value is `>= max(MIN_DELAY_BETWEEN_EMAILS_MS, sender.minimumDelay)`.

The effective delay for a job is the maximum of all three values.

The delay must be coordinated across multiple workers and instances, not implemented only through process-local timers.

Use Redis-backed coordination to reserve send slots safely.

### Parallel processing safety

- Use atomic Redis operations for shared rate-limit decisions.
- Avoid relying on in-memory counters.
- Ensure multiple workers cannot exceed the sender's hourly limit.
- Keep database status transitions safe under concurrent processing.

## 8. Hourly Rate Limiting

Implement per-sender hourly rate limiting.

This allows multiple senders to have independent hourly limits.

### Environment configuration

MAX_EMAILS_PER_HOUR_PER_SENDER=200

This environment variable sets the **system-wide maximum ceiling**. Each sender's `hourlyLimit` database field may set a lower per-sender value. The effective hourly limit for a given sender is `Math.min(sender.hourlyLimit, MAX_EMAILS_PER_HOUR_PER_SENDER)`. If a sender's `hourlyLimit` is not set, the environment variable value is used as the default.

### Rate-limit implementation

Use Redis-backed counters keyed by sender and hour window.

Example key:

email-rate:{senderId}:{hourWindow}

Processing flow:

1. Worker receives an email job.
2. Worker identifies the sender.
3. Worker checks the current hourly sending counter.
4. If capacity is available, it atomically reserves a sending slot.
5. Worker proceeds with email delivery.
6. Redis counter tracks the reserved sending capacity.
7. If the hourly limit has been reached, the job is delayed or rescheduled.
8. The job moves to the next available hour window.
9. No job is permanently discarded because of rate limiting.

Use atomic Redis operations, such as Lua scripts, to avoid race conditions between workers.

### Preserving order

When the hourly limit is reached:

- Reschedule remaining emails into the next available hour window.
- Preserve relative ordering for the same sender as much as practical.
- Avoid allowing later emails to overtake earlier ones unnecessarily.
- Keep the original email records and IDs intact.

### Rate-limit trade-offs

Document:
- How hourly windows are calculated.
- How Redis counters are reserved.
- How failed SMTP attempts affect reservations.
- How rescheduling is performed.
- How multiple workers coordinate.

## 9. Slack OAuth and Rate-Limit Notifications

Slack notification is a mandatory feature.

The application must send an actual Slack message when a sender reaches the hourly sending limit.

### Slack connection flow

1. User clicks Connect Slack.
2. Frontend redirects the user to the Slack OAuth authorization page.
3. User authorizes the application.
4. Slack redirects to the backend callback URL.
5. Backend exchanges the authorization code for an access token.
6. Backend securely stores the token and associated workspace information.
7. User's Slack connection status is updated.

### Rate-limit notification flow

1. Worker detects that a sender has reached the hourly limit.
2. Worker identifies the associated user or tenant.
3. Backend checks whether an active Slack connection exists.
4. If connected, send a Slack DM to the authorizing user using their stored `slackUserId` and the Slack Web API `chat.postMessage` method.
5. If not connected, skip notification without interrupting email processing.
6. Record notification details to avoid repeated notifications for the same sender and hour window.

Example Slack notification:

"Email sending limit reached!

Sender: example@company.com
Hourly limit: 200 emails
Current hour limit reached.

Remaining emails have been rescheduled to the next available hour window."

### Disconnect and reconnect

- Provide a Disconnect Slack option.
- Revoke or invalidate the stored connection as appropriate.
- Allow users to reconnect.
- New rate-limit events should use the current connection.
- No redeployment should be required.

### Security

- Store OAuth tokens securely.
- Encrypt tokens at rest using AES-256-GCM with a key from the `ENCRYPTION_KEY` environment variable.
- Validate OAuth state parameters.
- Request only necessary Slack scopes: `chat:write` for sending messages. Use the `auth.test` API response to resolve the authorizing user's Slack ID for DM-based notifications.
- Never expose access tokens to the frontend.

The demo must show a real Slack message arriving.

## 10. Email Sending Through Ethereal SMTP

Use Nodemailer with Ethereal Email.

### Sending flow

1. Worker receives a job.
2. Worker retrieves the corresponding email record.
3. Worker verifies that the email is eligible for sending.
4. Worker checks rate-limit capacity.
5. Worker reserves the appropriate send slot.
6. Worker applies minimum send spacing.
7. Worker updates the email status to processing.
8. Nodemailer sends the email through Ethereal SMTP.
9. On success, update PostgreSQL with sent status and sentAt.
10. On failure, record failure information and apply the configured retry policy.
11. Update the Elasticsearch index.

### Retry handling

Distinguish between transient and permanent SMTP failures.

- Retry temporary failures using BullMQ's built-in retry mechanism. Configure jobs with `attempts: 3` and exponential backoff (`backoff: { type: 'exponential', delay: 5000 }`).
- Record final failures after all retry attempts are exhausted.
- Avoid sending successfully delivered emails again.
- Do not treat a database update failure after SMTP delivery as proof that the email was not sent.

Document the delivery ambiguity and recovery strategy.

## 11. Elasticsearch Integration

Elasticsearch is required to make email records searchable.

### Indexed fields

- emailId
- userId
- senderId
- recipientEmail
- subject
- status
- scheduledAt
- sentAt
- createdAt

The email `body` is intentionally excluded from the Elasticsearch index to keep the index size manageable. Full email body content is retrieved from PostgreSQL when viewing individual email details.

### Indexing flow

1. Email is created in PostgreSQL.
2. Email document is indexed in Elasticsearch.
3. Worker processes the email.
4. PostgreSQL status is updated.
5. Elasticsearch document is updated with the latest status.
6. Dashboard search queries Elasticsearch.

### Search functionality

Allow users to search emails by:
- Recipient email.
- Subject.
- Sender.
- Status.

Ensure users can only access their own email records.

### Index consistency

PostgreSQL remains the source of truth.

If Elasticsearch is unavailable:
- Do not lose email records.
- Persist database changes independently.
- Retry failed indexing operations.
- Reconcile Elasticsearch documents from PostgreSQL when necessary.

## 12. Backend API Structure

Proposed REST API endpoints:

### Authentication

GET /auth/google

GET /auth/google/callback

GET /auth/me

POST /auth/logout

### Health

GET /health — Returns connectivity status of PostgreSQL, Redis, and Elasticsearch. Used for monitoring and readiness checks.

### Senders

POST /api/senders — Create a new sender with email, name, hourlyLimit, and minimumDelay.

GET /api/senders — List senders for the authenticated user.

PUT /api/senders/:id — Update sender configuration.

### Email scheduling

POST /api/emails/schedule

GET /api/emails/scheduled?page=1&limit=20

GET /api/emails/sent?page=1&limit=20

GET /api/emails/:id

GET /api/emails/search?q=...&page=1&limit=20

### Slack

GET /api/slack/connect

GET /api/slack/callback

GET /api/slack/status

POST /api/slack/disconnect

### Queue dashboard

Expose a protected BullMQ dashboard for live queue visibility.

Use a BullMQ-compatible dashboard such as Bull Board.

Restrict access to authenticated users. Any user who is logged in through Google OAuth may view the queue dashboard. For production, add role-based access control using an `ADMIN_EMAILS` environment variable or a user roles field.

All endpoints should include:
- Request validation.
- Authentication and authorization where required.
- Consistent error responses.
- Appropriate HTTP status codes.

### Session and authentication state management

Use `express-session` with `connect-redis` as the session store (Redis is already in the stack). Passport.js will serialize and deserialize the authenticated user to the session.

Configuration:
- `SESSION_SECRET` environment variable for signing session cookies.
- Sessions are stored in Redis with a configurable TTL.
- The frontend must include `credentials: 'include'` on all fetch/axios requests to send the session cookie.
- Use `sameSite: 'lax'` and `secure: true` (in production) for the session cookie.
- `GET /auth/me` reads the session cookie to identify the current user.

### CORS configuration

Since the frontend and backend run on different ports during development, the backend must configure CORS to allow requests from the frontend origin (`VITE_API_BASE_URL`). The CORS configuration must allow credentials (cookies) to be sent cross-origin.

## 13. Frontend Implementation

Use React, Vite, TypeScript, Tailwind CSS, and React Router.

### Authentication

Implement real Google OAuth.

After successful login:
- Redirect the user to the dashboard.
- Display the user's name.
- Display the user's email.
- Display the user's avatar.
- Provide a logout action.

### Main Dashboard

The dashboard should include:

- Top navigation/header.
- User information.
- Logout.
- Scheduled Emails tab.
- Sent Emails tab.
- Compose New Email button.
- Slack connection status and Connect Slack action.

Match the supplied Figma design as closely as possible.

### Compose New Email

Build a modal or separate compose page according to the Figma design.

Required fields:

- Subject.
- Email body.
- CSV/text file upload.
- Start time.
- Delay between emails.
- Hourly limit.

### CSV/Text parsing

Use Papa Parse for CSV parsing.

The frontend should:

1. Accept CSV or supported text files.
2. Extract email addresses.
3. Validate the detected addresses.
4. Display the number of valid email addresses.
5. Allow the user to schedule the emails.

The backend must independently validate all email addresses submitted by the frontend. The frontend sends a JSON payload containing the parsed email address array and scheduling parameters to `POST /api/emails/schedule`. The backend validates email format, deduplicates addresses, and enforces limits. The raw CSV file is not sent to the backend.

### Scheduled Emails

Display:

| Column | Description |
|---|---|
| Email | Recipient address |
| Subject | Email subject |
| Scheduled time | Intended delivery time |
| Status | Current email status |

Include:
- Loading state.
- Empty state.
- Error handling.

### Sent Emails

Display:

| Column | Description |
|---|---|
| Email | Recipient address |
| Subject | Email subject |
| Sent time | Actual delivery time |
| Status | sent / failed |

Include:
- Loading state.
- Empty state.
- Error handling.

### Reusable UI components

Create reusable components for:
- Buttons.
- Inputs.
- Tables.
- Modals.
- Navigation tabs.
- Loading indicators.
- Empty states.
- Toast notifications.

Use TypeScript interfaces for API responses and component props.

## 14. Suggested Project Folder Structure

reachinbox-scheduler/

├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── emails/
│   │   │   ├── senders/
│   │   │   ├── slack/
│   │   │   └── search/
│   │   ├── queues/
│   │   ├── workers/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── database/
│   │   ├── routes/
│   │   ├── utils/
│   │   └── app.ts
│   ├── prisma/
│   │   └── schema.prisma
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── compose/
│   │   │   ├── scheduled-emails/
│   │   │   ├── sent-emails/
│   │   │   └── slack/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── styles/
│   └── .env.example
│
├── docker-compose.yml
├── README.md
└── implementation.md

Keep queue processing, API routes, business logic, and frontend features separated.

## 15. Environment Variables

Create backend and frontend environment example files.

### Backend

DATABASE_URL=

REDIS_HOST=

REDIS_PORT=

ELASTICSEARCH_URL=

PORT=

NODE_ENV=

GOOGLE_CLIENT_ID=

GOOGLE_CLIENT_SECRET=

GOOGLE_CALLBACK_URL=

SLACK_CLIENT_ID=

SLACK_CLIENT_SECRET=

SLACK_CALLBACK_URL=

ETHEREAL_HOST=

ETHEREAL_PORT=

ETHEREAL_USER=

ETHEREAL_PASS=

WORKER_CONCURRENCY=5

MIN_DELAY_BETWEEN_EMAILS_MS=2000

MAX_EMAILS_PER_HOUR_PER_SENDER=200

SESSION_SECRET=

ENCRYPTION_KEY=

### Frontend

VITE_API_BASE_URL=

Use actual credentials only in local environment files. Never commit secrets to GitHub.

## 16. Implementation Milestones

### Milestone 1 — Project Setup

- Create GitHub repository.
- Set up backend and frontend applications.
- Configure TypeScript.
- Configure Express.
- Configure React + Vite.
- Install Tailwind CSS.
- Configure Docker Compose.
- Start PostgreSQL, Redis, and Elasticsearch.
- Establish database connectivity.

### Milestone 2 — Database and Email APIs

- Create Prisma schema.
- Implement User, Sender, Email, and SlackConnection models.
- Configure PostgreSQL migrations.
- Implement email scheduling API.
- Implement recipient-file parsing.
- Add validation using Zod.
- Implement idempotency.

### Milestone 3 — BullMQ Scheduler

- Configure Redis connection.
- Create BullMQ queue.
- Implement delayed jobs.
- Implement worker.
- Configure worker concurrency.
- Integrate Nodemailer and Ethereal SMTP.
- Persist delivery status.

### Milestone 4 — Reliability and Rate Limiting

- Implement minimum send delay.
- Implement Redis-backed hourly counters.
- Implement atomic rate-limit reservations.
- Reschedule jobs when hourly limits are reached.
- Implement restart recovery.
- Implement duplicate-send protection.
- Test multiple workers.

### Milestone 5 — Slack Integration

- Implement Slack OAuth.
- Store Slack connection securely.
- Implement connect and disconnect functionality.
- Send real Slack notifications.
- Implement notification deduplication.
- Test disconnected and reconnected accounts.

### Milestone 6 — Elasticsearch

- Configure Elasticsearch.
- Create email index.
- Implement indexing when emails are scheduled.
- Update index when email status changes.
- Implement search API.
- Implement indexing recovery.

### Milestone 7 — Frontend

- Implement Google OAuth login.
- Build dashboard layout.
- Build user header and logout.
- Build Compose New Email.
- Implement CSV parsing with Papa Parse.
- Connect scheduling API.
- Build Scheduled Emails table.
- Build Sent Emails table.
- Add loading, empty, and error states.
- Implement Slack connection UI.
- Match Figma design.

### Milestone 8 — Testing and Submission

- Test complete email scheduling flow.
- Test delayed-job execution.
- Test server restart recovery.
- Test idempotency.
- Test worker concurrency.
- Test minimum send delay.
- Test hourly rate limiting.
- Test Slack notification delivery.
- Test Elasticsearch search.
- Test Google OAuth.
- Prepare README.
- Record demo video.
- Create private GitHub repository.
- Grant reviewer access.
- Submit through the ClickUp form.

## 17. Testing Strategy

### Scheduling tests

- Schedule an email for a future time.
- Verify it is not sent early.
- Verify correct execution time.
- Verify multiple recipients are scheduled independently.

### Persistence tests

- Schedule future emails.
- Stop the worker.
- Restart the worker.
- Verify pending jobs remain.
- Verify emails are not duplicated.

### Idempotency tests

- Submit duplicate scheduling requests.
- Verify duplicate logical jobs are not created.
- Verify already-sent emails are not intentionally sent again.

### Concurrency tests

- Configure multiple workers.
- Process multiple jobs simultaneously.
- Verify configured concurrency.
- Verify sender limits are not exceeded.

### Rate-limit tests

- Reach the sender's hourly limit.
- Verify additional jobs are rescheduled.
- Verify jobs are not permanently failed.
- Verify order is preserved as much as practical.
- Verify multiple workers share the same counters.

### Slack tests

- Connect Slack.
- Trigger hourly rate limiting.
- Verify an actual Slack message arrives.
- Disconnect Slack.
- Verify processing continues without notification errors.
- Reconnect Slack.
- Verify notifications resume.

### Elasticsearch tests

- Index scheduled emails.
- Index sent emails.
- Search by recipient.
- Search by subject.
- Search by status.
- Verify users cannot access another user's email records.

### Frontend tests

- Google login.
- Logout.
- CSV upload.
- Recipient count.
- Email scheduling.
- Scheduled email listing.
- Sent email listing.
- Loading and empty states.
- Error handling.

## 18. Behavior Under Load

The system must be designed to handle 1,000+ emails scheduled around the same time.

### Expected behavior

1. Each email is stored independently in PostgreSQL.
2. Each email receives a unique job identifier.
3. BullMQ manages delayed job execution.
4. Configurable concurrency controls parallel processing.
5. Redis coordinates send spacing and hourly limits.
6. When the hourly limit is reached, additional jobs are rescheduled.
7. Email states are persisted in PostgreSQL.
8. Elasticsearch indexes email records for search.
9. The dashboard displays updated statuses.

The assignment does not require actually sending thousands of messages through Ethereal during the demo. The queue and rate-limit architecture must nevertheless support this workload.

## 19. README Requirements

The README must explain:

### Setup

- Backend installation and startup.
- Frontend installation and startup.
- PostgreSQL setup.
- Redis setup.
- Elasticsearch setup.
- Docker Compose usage.
- BullMQ worker startup.

### Integrations

- Ethereal account setup.
- SMTP configuration.
- Google OAuth setup.
- Slack OAuth setup.
- Environment variables.

### Architecture

- How scheduling works.
- How delayed jobs work.
- How persistence is handled.
- How restart recovery works.
- How idempotency is implemented.
- How worker concurrency is configured.
- How minimum send delay is enforced.
- How hourly rate limiting works.
- How jobs are rescheduled.
- How Slack notifications are triggered.
- How Elasticsearch indexing and searching work.

### Feature checklist

Map completed features to backend and frontend requirements.

Document any incomplete features, assumptions, shortcuts, and trade-offs honestly.

## 20. Demo Video Plan

Maximum duration: 5 minutes.

Suggested demonstration:

1. Show Google login.
2. Open the dashboard.
3. Compose an email and upload a lead CSV.
4. Show detected recipient count.
5. Schedule emails.
6. Show Scheduled Emails.
7. Show Ethereal email delivery.
8. Show Sent Emails.
9. Demonstrate stopping and restarting the worker.
10. Verify that future scheduled emails still execute.
11. Demonstrate hourly rate limiting and rescheduling.
12. Show an actual Slack notification.
13. Briefly show the BullMQ dashboard and Elasticsearch search.

## 21. GitHub and Submission

- Create a private GitHub repository.
- Push backend and frontend code.
- Include README.md.
- Include implementation.md.
- Include .env.example files.
- Never commit actual credentials.
- Grant access to Mitrajit and Yadav036.
- Upload the demo video.
- Submit the repository and details using:

https://forms.clickup.com/9005062261/f/8cbwpn-8876/6NNNJ92DV93PQTAYST

## 22. Final Engineering Priorities

The implementation should prioritize the following areas:

1. Reliable BullMQ scheduling and Redis persistence.
2. Correct job execution after restarts.
3. Idempotency and duplicate-send prevention.
4. Safe concurrency across multiple workers.
5. Atomic Redis-backed hourly rate limiting.
6. Correct rescheduling when limits are reached.
7. Real Slack OAuth and notifications.
8. Reliable Ethereal SMTP integration.
9. PostgreSQL data consistency.
10. Elasticsearch indexing and search.
11. Real Google OAuth authentication.
12. Clean and responsive React dashboard.

The goal is not simply to build an email-sending application. The goal is to demonstrate a reliable backend system that can coordinate asynchronous jobs, manage concurrent workloads, recover from failures, and maintain consistent delivery state.

**Final technology decisions:**

- PostgreSQL instead of MySQL.
- Prisma instead of writing all database queries manually.
- React + Vite instead of Next.js.
- Express.js for the backend API.
- TypeScript throughout the application.
- BullMQ + Redis for persistent job scheduling.
- Elasticsearch for searching emails.
- Nodemailer + Ethereal for SMTP.
- Tailwind CSS for the dashboard.
- Zod for validation.
- Papa Parse for CSV parsing.
- Docker Compose for infrastructure.

These choices are intended to keep the architecture focused on the core engineering challenges of the assignment while remaining maintainable and straightforward to demonstrate.