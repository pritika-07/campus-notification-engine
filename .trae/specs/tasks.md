# Campus Notification Engine - Implementation Plan

## Task 1: Scaffold monorepo structure (API + Worker + Dashboard + shared types)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Initialize root package.json with workspaces (apps/api, apps/dashboard, packages/shared).
  - Create NestJS API app with mongoose + bullmq + jwt + bcrypt + class-validator + class-transformer.
  - Create NestJS Worker app (or single-process combined with API via BullMQ workers).
  - Create React + Vite dashboard with Tailwind, React Router, axios client.
  - Create packages/shared package with PermissionsEnum, DTO types, error codes.
  - Add docker-compose.yml (MongoDB replica-set-ready, Redis).
  - Add .env + .env.example (MONGODB_URI, REDIS_URL, JWT_SECRET, PORT).
- **Acceptance Criteria Addressed**: NFR-4, NFR-5, FR-1 env
- **Test Requirements**:
  - `rule` TR-1.1: `npm run build` on root succeeds; API starts at PORT 3000; Dashboard Vite dev starts.
  - `rule` TR-1.2: docker-compose up starts mongodb and redis containers without error.
  - `rubric` TR-1.3: Workspace structure clean; scale 1-5; anchors 1=messy flat, 3=ok, 5=standard Nx-lite; threshold >=3; evidence: tree listing

## Task 2: Implement MongoDB schemas & repositories (User, Org, Member, Env, Workflow/NotificationTemplate, ControlValues, Subscriber, Message, Job, ExecutionDetail, Integration, AcademicCalendar)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Schema for Environment requires type (DEV|PROD) required; NO post hooks injecting type (Gap 7 fix).
  - NotificationTemplate schema skips 2 deprecated compound indexes (Gap 6 fix). Indexes: { _environmentId: 1, 'triggers.identifier': 1 }, { _environmentId: 1, _id: 1 }.
  - Subscriber partial unique index { subscriberId:1, _environmentId:1 } with deleted=false; mongoose-delete plugin.
  - Message NO soft-delete; archived:boolean instead; TTL index on createdAt (90d); compound inbox index (subscriberId, envId, channel, seen, read, archived, snoozedUntil, createdAt:-1); dedup index (transactionId, subscriberId, envId, channel) — NO 4 pre hooks (Gap 3 fix).
  - ControlValues schema linked to workflowId + stepId.
  - AcademicCalendar entity: period type enum + effective date range per Environment.
- **Acceptance Criteria Addressed**: FR-1, FR-8, FR-9, FR-19, FR-20, AC-6 foundation
- **Test Requirements**:
  - `rule` TR-2.1: Mongoose models compile without error; indexes verified via model.listIndexes().
  - `rule` TR-2.2: Grep `pre('find` in message.schema.ts → zero results (Gap 3 check).
  - `rule` TR-2.3: Grep deprecated comment with index creation → zero results (Gap 6 check).
  - `rule` TR-2.4: Grep `post('find` with type injection in env.schema.ts → zero results (Gap 7 check).
  - `rubric` TR-2.5: Schema field completeness vs DATA_MODEL.md; scale 0-10 match; anchors 2=half missing, 6=most there, 10=complete; threshold >=8; evidence: schema diff checklist

## Task 3: Auth (JWT signup/signin) + RBAC permissions guard + API key auth + current-user session scopes Org/Env
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - AuthModule: signup, signin endpoints return JWT; passwords bcrypt hashed.
  - On signup: auto-create Org → Dev + Prod Env → Member with ADMIN role → seed API keys.
  - JwtStrategy extracts user; attaches _organizationId, _environmentId (default Dev) to request.
  - ApiKeyAuth: looks up Environment.apiKeys[].hash via bcrypt.compare; attaches env context.
  - Permissions guard: @RequirePermissions(...); checks roles → permissions mapping. Default ADMIN=all, MEMBER=READs.
  - PermissionsEnum: WORKFLOW_READ, WORKFLOW_WRITE, SUBSCRIBER_READ, SUBSCRIBER_WRITE, NOTIFICATION_READ, EVENT_WRITE, API_KEY_READ.
- **Acceptance Criteria Addressed**: FR-2, FR-3, FR-4, AC-5
- **Test Requirements**:
  - `rule` TR-3.1: Signup → 201 + JWT token with payload.
  - `rule` TR-3.2: ApiKey header valid vs stored hash.
  - `rule` TR-3.3: User with WORKFLOW_READ attempts DELETE workflow → 403 and repository.delete spy NOT called (AC-5).
  - `rule` TR-3.4: User with WORKFLOW_WRITE attempts DELETE workflow → 204/200 and proceeds.

## Task 4: Workflow CRUD controllers + atomic session writes + step _id ownership validation (Gap1+Gap4 fixes)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - Workflow V2 controller: GET/POST/PUT/PATCH/DELETE/GET single.
  - UpsertWorkflowUseCase opens mongoose.startSession() → session.withTransaction() wrapping NotificationTemplate create/update + ControlValues bulk inserts/updates. Session passed to repository methods (Gap 1 fix / AC-3).
  - On PUT workflow, before step matching, query all step IDs of existing workflow from DB; reject any incoming step._id not in that set → 400 STEP_NOT_IN_WORKFLOW (Gap 4 fix / FR-6).
  - Step ID uniqueness (slugify step name + retry up to 5 times).
  - Control for HTML prettify errors: if email step HTML fails to format, throw BadRequestException MALFORMED_HTML — do NOT swallow (Gap 5 check: no catch+warn without rethrow).
  - Support sync endpoint (PUT /v2/workflows/:id/sync) cross env same org.
  - Soft-delete via mongoose-delete plugin.
- **Acceptance Criteria Addressed**: FR-5, FR-6, AC-1, AC-3, FR-7, FR-8
- **Test Requirements**:
  - `rule` TR-4.1: POST valid workflow with step + controlValues → 201; both NotificationTemplate + ControlValues queried exist (AC-1).
  - `rule` TR-4.2: Simulated ControlValues insert failure mid-write → session rolls back NotificationTemplate (AC-3); query by name returns 0; HTTP 500 + error code.
  - `rule` TR-4.3: PUT with step._id from OTHER workflow → 400 STEP_NOT_IN_WORKFLOW (Gap 4 fix).
  - `rule` TR-4.4: Grep `logger.warn` with prettier.format catch that does not rethrow → 0 occurrences (Gap 5 fix).
  - `rule` TR-4.5: Workflow created in Dev env then listed via Prod env → 0 results (AC-6 isolation via env scope).

## Task 5: Subscriber CRUD + 409 on duplicate (Gap 2 fix) + channel preference management
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - SubscriberController: GET list/search, POST upsert, GET single, PUT update, DELETE soft-delete.
  - Subscriber repository.create catches MongoServerError with code===11000 and rethrows NestJS ConflictException({ error: 'SUBSCRIBER_ALREADY_EXISTS', subscriberId }). Concurrent POST same subscriberId same env → 409 never 500 (Gap 2 fix / AC-4).
  - Subscriber channels preferences: channels.email.enabled:boolean, channels.in_app.enabled:boolean etc. Mute email = set enabled=false.
- **Acceptance Criteria Addressed**: FR-10, FR-11, AC-4, AC-8 foundation
- **Test Requirements**:
  - `rule` TR-5.1: Two concurrent POST same subscriberId/env → one 201/200, one 409 with { error: 'SUBSCRIBER_ALREADY_EXISTS' } (AC-4); no 500.
  - `rule` TR-5.2: Subscriber list with WORKFLOW_READ user from DIFFERENT environment of the subscriber → 0 results (AC-6 isolation).
  - `rule` TR-5.3: DELETE subscriber → soft-deleted; new POST same subscriberId succeeds (partial index allows re-creation).

## Task 6: Trigger API + BullMQ Job queue + Worker dispatch pipeline with step rendering, providers, subscriber preference checks (AC-2, AC-8, AC-9)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4, Task 5
- **Description**:
  - EventsController: POST /v1/events/trigger (ApiKey auth EVENT_WRITE) validates workflow exists by triggers.identifier; subscriber exists; payload validation; creates Notification record + enqueues BullMQ job with transactionId.
  - Worker process (combined with API process or separate — documented):
    1. Dequeue job.
    2. Fetch workflow + subscriber.
    3. For each step: if step is digest → digest aggregator; else check subscriber channels[step.channel].enabled preference — if muted → skip; else render step content using controlValues + payload substitution.
    4. Select provider Integration per environment.
    5. Dispatch via provider (in-app provider writes Message directly; email provider stubbed returning success).
    6. Create Message record with dedup check (findOneAndUpdate with upsert false on dedup key OR only insert if not exists).
    7. Write ExecutionDetail status=success/error.
  - BullMQ attempts: retries with backoff (exponential 2^n). Retries DO NOT double-insert because of dedup index + conditional insert (AC-9).
- **Acceptance Criteria Addressed**: FR-12, FR-13, FR-14, FR-15, FR-16, AC-2, AC-8, AC-9
- **Test Requirements**:
  - `rule` TR-6.1: Trigger with email step + stub provider → within 30s ExecutionDetail status=success present for transactionId (AC-2).
  - `rule` TR-6.2: Subscriber email muted → trigger workflow with email+in_app steps → in_app Message count=1; email-type Message count=0; email ExecutionDetail not present (AC-8).
  - `rule` TR-6.3: Simulated transient first-attempt failure → provider retries and eventually succeeds → Message dedup query count===1 eventually success (AC-9).
  - `rule` TR-6.4: Trigger with ApiKey auth from different org env → 404/403 (isolation).

## Task 7: Burst digest aggregator (5min default) + Academic calendar-aware digest scheduler (FR-17 FR-21 AC-7 AC-10)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 6
- **Description**:
  - DigestStep handling: events with same subscriberId + same digest step key within digest window collected into digest bucket in Redis (sorted set / hash keyed by subscriberId:workflowIdDigestKey).
  - BullMQ delayed job scheduled for window-end. On processing: read bucket, aggregate into single digest content, write one Message.
  - Default digest window = 5 min (regular_week).
  - AcademicCalendar service: getCurrentPeriodForEnvironment(envId) → lookup current AcademicCalendar record for environment → returns period enum.
  - Digest window = f(period, isCriticalFlag): exam_period && !isCritical → window = 60 min (longer); regular_week && !isCritical → 5 min; holiday → 2 hours; orientation → 15 min. Critical events always pass through immediate regardless of period (so AC-10 covers 10 non-critical).
- **Acceptance Criteria Addressed**: FR-17, FR-21, AC-7, AC-10
- **Test Requirements**:
  - `rule` TR-7.1: 10 trigger events same user within 5 minutes (regular period) → one digest Message written; count===1; content shows 10 event summaries (AC-7).
  - `rule` TR-7.2: Academic calendar set to exam_period, 10 non-critical events same subscriber within 1 hour → count===1 after 60-minute window; count===0 before window ends (AC-10 confirms longer window holding).
  - `rule` TR-7.3: Critical event in exam_period → delivered immediately (not held).

## Task 8: Activity Feed controller + SSE real-time endpoint + In-App inbox endpoints (mark seen/read/archive)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 6
- **Description**:
  - ActivityController GET /v1/activity: pagination, filter by channels/templates/search; joins Messages + ExecutionDetails by transactionId.
  - SSE endpoint GET /v1/sse: subscriber JWT auth → text/event-stream; on Message insert → emit notification_received.
  - Inbox endpoints: GET /v1/inbox (subscriber messages), POST /v1/messages/:id/seen, POST /v1/messages/:id/read, POST /v1/messages/:id/archive.
- **Acceptance Criteria Addressed**: FR-18, FR-14
- **Test Requirements**:
  - `rule` TR-8.1: Trigger event → GET /v1/activity shows row with status within 30s.
  - `rule` TR-8.2: SSE client connects → new trigger → client receives notification_received event within 5s.
  - `rule` TR-8.3: POST mark seen/read → Message field updated to true; archived → true; query matches.

## Task 9: Implement Dashboard SPA pages (SignIn, SignUp, Workflows list/create/edit, Subscribers list/create/edit, Activity, Inbox) with Tailwind CSS
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4, Task 5, Task 8
- **Description**:
  - Setup axios API client, JWT storage, AuthContext.
  - ProtectedRoute wrapper checking permissions + auth.
  - SignIn/SignUp forms.
  - Workflows: list table, create/edit drawer with step selector (type: in_app, email), controlValues editor (subject, body), activate/deactivate toggle, delete.
  - Subscribers: list/search, create/edit, channel preference toggles, delete.
  - Activity Feed: table with filters, status chips, transactionId search.
  - Inbox: real-time SSE subscription, message list, mark seen/read buttons, archive.
- **Acceptance Criteria Addressed**: FR-22, FR-23, FR-24, FR-25, FR-26
- **Test Requirements**:
  - `rule` TR-9.1: Dashboard build succeeds (vite build).
  - `rule` TR-9.2: End-to-end happy path via browser snapshot or manual: create workflow → create subscriber → trigger via curl → activity shows status → inbox shows message (evidence: screenshots or Playwright recordings).
  - `rubric` TR-9.3: UI usability; scale 1-5; anchors 1=broken, 3=usable, 5=delightful; threshold >=3; evidence: snapshot.

## Task 10: Integrations CRUD (Email/In-App) + provider selection logic + Academic Calendar admin endpoints
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 4
- **Description**:
  - Integrations CRUD: providerId (sendgrid/nodemailer-stub/twilio/fcm/in-app), channel, credentials encrypted with AES-256-GCM using app key, active flag.
  - Provider registry with stub email provider that always succeeds and writes success detail.
  - Academic Calendar endpoints: GET/PUT current period per environment.
- **Acceptance Criteria Addressed**: FR-15, FR-20
- **Test Requirements**:
  - `rule` TR-10.1: Create integration + activate → worker resolves provider and dispatch succeeds.
  - `rule` TR-10.2: Academic Calendar PUT exam_period → GET returns exam_period.

## Task 11: End-to-end tests & verification script covering all ACs + killer tests
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7, Task 9, Task 10
- **Description**:
  - Jest/Pactum/NestJS e2e test suite that runs:
    - Workflow CRUD + AC-1, AC-3
    - Subscriber concurrent create + AC-4
    - Permission delete + AC-5
    - Env isolation + AC-6
    - Trigger & delivery timeout + AC-2
    - Burst digest + AC-7
    - Channel preference muted email + AC-8
    - Retry without duplicate + AC-9
    - Academic calendar digest + AC-10
    - Part-A gaps absence checklist (AC-11 rubric checklist)
  - `npm test` runs them.
- **Acceptance Criteria Addressed**: All ACs
- **Test Requirements**:
  - `rule` TR-11.1: `npm test` passes all 10 AC e2e tests.
  - `rubric` TR-11.2: AC-11 (no Part-A defects) checklist score >=6; evidence: output + grep results.
