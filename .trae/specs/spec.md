# Campus Notification Engine - Prototype Product Requirements Document

## Overview
- **Summary**: Build a working prototype of the Campus Notification Engine — a multi-tenant, multi-channel notification system for university campuses. The prototype supports workflow creation with typed steps, subscriber management, at least one delivery channel (In-App), event triggering, activity feed, API key auth, RBAC permissions, burst digest, channel preference, retry without duplicates, and academic-calendar-aware digest scheduling.
- **Purpose**: Provide a clean-room prototype that satisfies all MoSCoW Must-Have features and the 3 killer tests (burst digest, channel preference, retry without duplicates) plus the academic calendar digest differentiator. The prototype must NOT replicate any of the 7 confirmed defects from GAPS.md Part A (those gaps are bugs in the original; our implementation follows our own clean architecture decisions instead).
- **Target Users**: Admin/Sender (department registrar, faculty coordinator), Student/Recipient (enrolled student), Developer/Integrator (campus IT developer calling the API).

## Goals
1. Run a NestJS + MongoDB + Redis prototype that exercises every Must-Have PRD features.
2. Pass all 4 killer/differentiator acceptance criteria (AC-7 burst digest, AC-8 channel preference, AC-9 retry-without-duplicate, AC-10 academic calendar digest).
3. Implement the 2 Part-B gap fixes (atomic workflow writes, structured 409 on duplicate subscriber) plus academic calendar differentiator.
4. Provide a minimal React + Vite dashboard for sign-in, workflows list/create, subscribers list, activity feed, in-app inbox.
5. No replication of the 7 Part-A GAPS (soft-delete Message pre-hooks, client-trusted step _id matching, swallowed HTML prettify errors, deprecated indexes, backward-compat env hook mutation, etc. — our implementation ships without them.

## Non-Goals
- AI-generated workflow suggestions (Won't Have per PRD).
- Custom domain email sending.
- Billing / subscription tiers / Stripe.
- Webhook egress from subscriber actions.
- ClickHouse analytics (MongoDB aggregations only).
- Separate ws / webhook apps.
- Enterprise tree.

## Background & Context
Docs are under [docs/](file:///home/ayan/Projects/campus-notification-engine/docs):
- [PRD.md](file:///home/ayan/Projects/campus-notification-engine/docs/PRD.md) — problem, users, core flow, MoSCoW, 10 ACs.
- [GAPS.md](file:///home/ayan/Projects/campus-notification-engine/docs/GAPS.md) — Part A 7 confirmed original defects we must NOT replicate; Part B 2 gap fixes + 1 differentiator we implement.
- [ARCHITECTURE.md](file:///home/ayan/Projects/campus-notification-engine/docs/ARCHITECTURE.md) — 6 architecture decisions: MongoDB session for atomic writes; 409 on duplicate subscriber; Message TTL index (no soft-delete hooks); step _id ownership validation; single-process API with SSE (no separate ws); no env backward-compat hook.
- [DATA_MODEL.md](file:///home/ayan/Projects/campus-notification-engine/docs/DATA_MODEL.md) — 15 entities; deprecated indexes explicitly skipped on NotificationTemplate.
- [API.md](file:///home/ayan/Projects/campus-notification-engine/docs/API.md) — routes, auth, permissions, error codes.
- [OBSERVATIONS.md](file:///home/ayan/Projects/campus-notification-engine/docs/OBSERVATIONS.md) — evidence-based observations.
- [SUBMISSION.md](file:///home/ayan/Projects/campus-notification-engine/SUBMISSION.md) — 3 killer tests + 2 improvements + differentiator.

Tech stack confirmed (per OBSERVATIONS + ARCHITECTURE):
- API + Worker: NestJS (TypeScript), MongoDB 6+, Redis 7+ (BullMQ)
- Dashboard: React 18 + Vite + TypeScript
- Real-time: SSE endpoint (not a separate ws app)

## Functional Requirements

### Core Tenant & Auth
- **FR-1 Multi-tenant isolation**: Each Organisation owns Environments (Dev, Prod); every API query/insert is scoped by _environmentId and _organizationId; a Dev subscriber is invisible from Prod (AC-6).
- **FR-2 JWT auth**: Dashboard users sign up/sign in; JWT session scoped to current Org/Environment.
- **FR-3 API key auth per Env**: Environment.apiKeys[] stores hash (raw key returned only at creation); ApiKey header lookup returns the environment; hash verified via bcrypt.
- **FR-4 RBAC permissions**: WORKFLOW_READ, WORKFLOW_WRITE, SUBSCRIBER_READ, SUBSCRIBER_WRITE, NOTIFICATION_READ, EVENT_WRITE, API_KEY_READ enforced via decorators; 403 before any DB write (AC-5).

### Workflows
- **FR-5 Workflow CRUD**: POST/PUT/PATCH/DELETE/GET /v2/workflows; POST + PUT writes use a MongoDB Client Session wrapping NotificationTemplate insert + ControlValues inserts in a single transaction so partial writes are rolled back (AC-1, AC-3).
- **FR-6 Step _id ownership validation**: On PUT, load existing step IDs from the target workflow from MongoDB; reject any incoming step._id not in that set with 400 STEP_NOT_IN_WORKFLOW (Decision 4 / Gap 4 fix).
- **FR-7 Step type support**: email, in_app, sms, push, digest step types; at minimum in_app implemented end-to-end; email mock implemented with stub provider so AC-2 runs.
- **FR-8 No deprecated indexes**: NotificationTemplate skips the 2 deprecated compound indexes noted deprecated/skipped (Gap 6 fix).
- **FR-9 No env backward-compat hook**: Environment.schema requires type=DEV|PROD at document creation; no post hook mutates returned docs (Gap 7 fix).

### Subscribers
- **FR-10 Subscriber CRUD + soft-delete + uniqueness**: POST /v2/subscribers creates with partial unique index { subscriberId, _environmentId } where deleted=false; concurrent duplicates throw ConflictException({ error: 'SUBSCRIBER_ALREADY_EXISTS' }) → 409 (AC-4 / Gap 2 fix); never a raw 500.
- **FR-11 Channel preference / opt-out**: Subscribers can mute channels (e.g., email muted); worker checks preferences before dispatch and skips muted channels (AC-8).

### Trigger & Delivery
- **FR-12 Trigger API**: POST /v1/events/trigger with ApiKey auth, validates workflow exists + subscriber exists + payload matches schema; enqueues BullMQ job; returns { acknowledged: true, transactionId } (AC-2).
- **FR-13 Worker dispatch pipeline**: Worker dequeues → resolves Subscriber + Workflow → renders step content → checks subscriber channel preference → selects provider → dispatches → writes Message + ExecutionDetail.
- **FR-14 In-App channel delivery + SSE**: In-App messages written to Message.collection with seen/read/archived; SSE /v1/sse emits notification_received events (Decision 5).
- **FR-15 Email (mock/SMTP stub provider**: Stub email provider; real provider credentials optional; succeeds and writes success ExecutionDetail within 30s (AC-2).
- **FR-16 Retry without duplicate**: BullMQ attempts with backoff; Message dedup index on (transactionId, _subscriberId, _environmentId, providerId/channel); retries do not double-insert (AC-9).
- **FR-17 Burst digest window (5min): 10 events within 5 minutes for same subscriber on same non-urgent workflow → one digest Message, not 10 separate (AC-7); BullMQ delayed jobs + digest aggregator.
- **FR-18 Activity feed**: GET /v1/activity lists ExecutionDetails + Messages grouped by transactionId with per-channel status (sent/error/warning).
- **FR-19 Message TTL, no soft-delete hooks**: Message.collection uses TTL index on createdAt (90d default); archived flag replaces soft-delete; no find/findOne/findOneAndUpdate/countDocuments pre hooks filter deleted (Gap 3 fix).

### Academic Calendar (Differentiator)
- **FR-20 Academic Calendar entity**: Periods (regular_week, exam_period, orientation, holiday); current period settable per Environment.
- **FR-21 Academic-calendar-aware digest scheduler**: Digest window adapts to current period; exam_period → longer non-critical digest window (e.g., 60 min vs default 5 min); 10 non-critical events in exam_period window → one digest at window end (AC-10 / Improvement 3).

### Dashboard SPA
- **FR-22 Sign-in / Sign-up page**: JWT auth.
- **FR-23 Workflows page**: List, create, edit, activate, delete workflows with in-app or email step.
- **FR-24 Subscribers page**: List, create, edit, soft-delete subscribers.
- **FR-25 Activity Feed page**: Per-message delivery status table.
- **FR-26 In-App Inbox page**: Real-time via SSE; mark seen/read; archive.

## Non-Functional Requirements
- **NFR-1**: MongoDB replica-set-compatible session support (required by Decision 1 trade-off): Documented requirement noted.
- **NFR-2**: API response times < 500ms for CRUD APIs (except trigger enqueue).
- **NFR-3**: Standard error envelope { statusCode, error, message } on all non-2xx.
- **NFR-4**: TypeScript strict mode on both API + dashboard.
- **NFR-5**: Dotenv + .env.example in repo root with MONGODB_URI, REDIS_URL, JWT_SECRET, PORT.

## Constraints
- **Technical**: Clean-room. No copying Novu source. NestJS + Mongoose + BullMQ; React + Vite. No ClickHouse. No separate ws/webhook apps. No enterprise tree.
- **Business**: Prototype scope = PRD Must-Have + killer tests + differentiator + gap fixes only.
- **Dependencies**: MongoDB 6+ (replica set or single node with transactions via startSession → document-level session.

## Assumptions
1. A local MongoDB with replica-set-mode or a single-node that accepts sessions is available via Docker Compose; if a single-node standalone, tests can skip the transaction test with a fallback documented note.
2. For the prototype, Email provider is stubbed so sending succeeds without real SendGrid credentials; Integration provider configures.
3. Dashboard auth uses local JWT (no Clerk).
4. Dashboard uses Tailwind CSS for UI (per user profile preferences).
5. Academic Calendar seeded with default period = regular_week; admin can set exam_period via environment-level config in the prototype.

## Acceptance Criteria

### AC-1: Workflow CRUD - Create workflow atomically persisted
- **Type**: `rule`
- **Given**: Authenticated admin with WORKFLOW_WRITE permission, valid CreateWorkflowDto
- **When**: POST /v2/workflows with one step containing controlValues
- **Then**: 201 returned; NotificationTemplate + ControlValues documents exist with matching _workflowId/_stepId
- **Pass Condition**: HTTP 201 status + database query shows both docs for same _workflowId
- **Evidence**: curl POST /v2/workflows → 201; mongosh query for NotificationTemplate + ControlValues both present and linked

### AC-2: Trigger & Delivery within 30s
- **Type**: `rule`
- **Given**: Active workflow with Email step + configured stub integration
- **When**: Trigger API called with valid subscriberId + payload
- **Then**: BullMQ job processes; ExecutionDetail with status=success written within 30 s
- **Pass Condition**: within 30 s after trigger, ExecutionDetail.status === success exists
- **Evidence**: Trigger call returns transactionId; after <30 s DB query for ExecutionDetail.status=success for that transactionId

### AC-3: Delivery Atomicity - ControlValues write failure rolls back NotificationTemplate
- **Type**: `rule`
- **Given**: Workflow create whose step mid-fails on 2nd insert (2nd write
- **When**: Failure occurs (simulated by test injecting an invalid ControlValues doc)
- **Then**: No partial NotificationTemplate left in DB; API returns 500 with machine-readable code
- **Pass Condition**: After failure, query by name returns 0 documents; response statusCode>=500
- **Evidence**: Simulated-failure test; before/after DB counts + HTTP 5xx

### AC-4: Subscriber Uniqueness - Concurrent duplicates → 409
- **Type**: `rule`
- **Given**: Two concurrent POST /v2/subscribers same subscriberId same Environment
- **When**: Both arrive simultaneously
- **Then**: Exactly one doc created; second receives 409 { error: "SUBSCRIBER_ALREADY_EXISTS" }
- **Pass Condition**: Count=1 in DB; one response status=409 error=SUBSCRIBER_ALREADY_EXISTS; no 500
- **Evidence**: Concurrent requests; one=201/200, one=409 structured body; count query === 1

### AC-5: Permission Enforcement - 403 before DB write
- **Type**: `rule`
- **Given**: Authenticated user with only WORKFLOW_READ
- **When**: DELETE /v2/workflows/:id
- **Then**: 403 before any DB write
- **Pass Condition**: HTTP 403; no delete logged/similar queries at DB (mocked/spy'd repository)
- **Evidence**: DELETE → 403; mock/spy confirm delete method NOT called

### AC-6: Multi-Environment Isolation
- **Type**: `rule`
- **Given**: Dev + Prod envs same Org
- **When**: Subscriber created in Dev
- **Then**: Prod subscriber list with same subscriberId 0 results from Prod API
- **Pass Condition**: Prod GET /v2/subscribers query doesn't show Dev subscriber
- **Evidence**: create in Dev (201); list from Prod → 0 count filter

### AC-7: Burst Digest (Killer Test)
- **Type**: `rule`
- **Given**: 10 notification events same user within 5 minutes
- **When**: Engine processes events
- **Then**: One digest Message instead of 10 separate
- **Pass Condition**: Message count = 1; content lists all 10 events summarized
- **Evidence**: 10 triggers → count query ===1; digest content size confirms aggregation

### AC-8: Channel Preference (Killer Test)
- **Type**: `rule`
- **Given**: User muted email notifications
- **When**: Trigger email/in-app workflow
- **Then**: In-App Message exists; Email Message/ExecutionDetail for email does not exist
- **Pass Condition**: Email-type count ===0; in_app count ===1
- **Evidence**: Subscriber channels.email.muted=true → after trigger; email Messages =0; in_app=1

### AC-9: Retry Without Duplicate (Killer Test)
- **Type**: `rule`
- **Given**: A send attempt fails then retries
- **When**: Retries occur and then succeed
- **Then**: 1 success Message eventually; no duplicate Messages
- **Pass Condition**: Message dedup query count===1; status eventually success
- **Evidence**: Simulated transient failure → retry → final count ===1; status success

### AC-10: Academic Calendar Digest (Differentiator)
- **Type**: `rule`
- **Given**: Academic calendar marks current week = exam_period
- **When**: 10 non-critical events same subscriber within 1 hour
- **Then**: One digest held until end of (longer) exam digest window (not 10 separate)
- **Pass Condition**: count ===1; digest window length=exam-period-length > default regular window
- **Evidence**: Current period set to exam_period →10 triggers → count ===1; timing confirms window extension

### AC-11: Prototype code quality - No original Part-A defects replicated
- **Type**: `rubric`
- **Dimension**: Absence of 7 original Part-A defects (Gap 1-7 from GAPS.md) as implemented
- **Scale**: 0-7 (0=all present;7=none present)
- **Anchors**: 1 = ≥4 Part-A defects present; 4 = 1-2 present; 7 = zero Part-A defects
- **Pass Threshold**: >= 6
- **Evidence**: Code inspection checklist against Gap 1-7: Grep for soft-delete Message hooks deprecated indexes post env post hook step _id match without ownership swallow prettier warn non-transactional sequential upsert workflow controls 500 e11000

## Open Questions
- [ ] None. Prototype scope explicitly confirmed via docs; all decisions from ARCHITECTURE.md taken as given.
