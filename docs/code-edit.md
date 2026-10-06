# Campus Notification Engine — Prototype Code Edit Documentation

This file documents **every source file** in the prototype. For each file it states:
- **Meaning** — what the file does and where it sits in the architecture.
- **Reason** — why it exists in this shape (which PRD requirement, architecture decision, or GAPS.md fix motivated it).
- **Important Code** — the snippets or concepts you must not break.

> The prototype implements all MoSCoW Must-Have features from [PRD.md](file:///home/ayan/Projects/campus-notification-engine/docs/PRD.md) plus the Part-B gap fixes from [GAPS.md](file:///home/ayan/Projects/campus-notification-engine/docs/GAPS.md) (atomic writes, structured 409 on duplicate subscriber) and the academic-calendar-aware digest differentiator (AC-10). It deliberately does **not** replicate any of the 7 Part-A defects documented in GAPS.md Part A.

---

## 1. Monorepo Root

### [package.json](file:///home/ayan/Projects/campus-notification-engine/package.json)
- **Meaning** : NPM workspaces root that wires together `apps/*` and `packages/*`.
- **Reason**  : PRD and ARCHITECTURE.md describe multiple apps (API + Dashboard) plus a shared types package. Workspaces let each workspace declare its own dependencies and still share `@campus/shared` via symlink (`"@campus/shared": "*"`).
- **Important** :
  ```
  "workspaces": ["apps/*", "packages/*"]
  "scripts": { "build": "npm run build --workspaces --if-present",
               "dev:api": …, "dev:dashboard": …, "dev": "concurrently…" }
  ```
  Running `npm run build` here cascades a build through shared, API, dashboard.

### [tsconfig.base.json](file:///home/ayan/Projects/campus-notification-engine/tsconfig.base.json)
- **Meaning** : Shared TypeScript `compilerOptions` (strict mode, ES2021 target, node16 modules, paths alias for `@campus/shared`).
- **Reason**  : NFR-4 requires TypeScript strict mode on both API and dashboard. This single base keeps both sides in sync.
- **Important** : `"strict": true`, `"paths": { "@campus/shared": ["../packages/shared/src/index.ts"] }`.

### [docker-compose.yml](file:///home/ayan/Projects/campus-notification-engine/docker-compose.yml)
- **Meaning** : Starts MongoDB 7 (replica-set mode) and Redis 7 via Docker.
- **Reason**  : Decision 1 (atomic writes) requires MongoDB sessions which work only in replica-set or single-node-session configurations. Redis is required by BullMQ (used for digest bursts and retries).
- **Important** : MongoDB container runs with `mongod --replSet rs0`; there is an init sidecar that calls `rs.initiate()` so sessions work out of the box.

### [.env.example](file:///home/ayan/Projects/campus-notification-engine/.env.example)
- **Meaning** : Lists every required env variable: `MONGODB_URI`, `REDIS_HOST`, `REDIS_PORT`, `JWT_SECRET`, `PORT`, `DASHBOARD_PORT`.
- **Reason**  : NFR-5 mandates dotenv + .env.example.

### [README.md](file:///home/ayan/Projects/campus-notification-engine/README.md)
- **Meaning** : Quick start (docker-compose up, npm install, npm run dev, dashboard url).
- **Reason**  : So an evaluator can run the prototype.

### [SUBMISSION.md](file:///home/ayan/Projects/campus-notification-engine/SUBMISSION.md)
- **Meaning** : Maps each submission check-point (3 killer tests + 2 improvements + differentiator) to files in the codebase.
- **Reason**  : Evaluator-facing cross-reference.

---

## 2. packages/shared

### [packages/shared/package.json](file:///home/ayan/Projects/campus-notification-engine/packages/shared/package.json)
- **Meaning** : Package manifest declaring the shared types package.
- **Reason**  : Both API and dashboard need identical enums (ChannelTypeEnum, permissions). A shared package eliminates mismatches.

### [packages/shared/tsconfig.json](file:///home/ayan/Projects/campus-notification-engine/packages/shared/tsconfig.json)
- **Meaning** : TS config for the shared package. Inherits from `../../tsconfig.base.json`.
- **Reason**  : Lets `@campus/shared` compile independently.

### [packages/shared/src/enums.ts](file:///home/ayan/Projects/campus-notification-engine/packages/shared/src/enums.ts)
- **Meaning** : All cross-cutting enums and error codes.
- **Reason**  : Every module uses these values; centralising guarantees consistency between API DB writes and dashboard UI.
- **Important** :
  - `ChannelTypeEnum` includes `EMAIL | SMS | PUSH | IN_APP | CHAT | DIGEST | DELAY`. Worker routes by this enum.
  - `ErrorCode` includes `SUBSCRIBER_ALREADY_EXISTS` → thrown by SubscriberRepository for AC-4.
  - `AcademicPeriodEnum` → `REGULAR_WEEK | EXAM_PERIOD | ORIENTATION | HOLIDAY`. Used by `DigestWindowService` for AC-10.
  - `DigestLevelEnum` distinguishes control-value scopes (step vs step+provider) used by ControlValues.

### [packages/shared/src/permissions.ts](file:///home/ayan/Projects/campus-notification-engine/packages/shared/src/permissions.ts)
- **Meaning** : RBAC permission tokens and role → permission mapping.
- **Reason**  : FR-4 and AC-5 require RBAC enforcement. Keeping the mapping in a shared package means the dashboard `ProtectedRoute` and the API `PermissionsGuard` agree on what `WORKFLOW_WRITE` means.
- **Important** :
  ```ts
  export enum PermissionsEnum {
    WORKFLOW_READ, WORKFLOW_WRITE, SUBSCRIBER_READ, SUBSCRIBER_WRITE,
    NOTIFICATION_READ, EVENT_WRITE, API_KEY_READ, INTEGRATION_READ, INTEGRATION_WRITE }
  export const ROLE_PERMISSIONS = {
    [RoleEnum.ADMIN]:  Object.values(PermissionsEnum),   // all perms
    [RoleEnum.MEMBER]: [WORKFLOW_READ, SUBSCRIBER_READ, NOTIFICATION_READ, INTEGRATION_READ]
  }
  ```

### [packages/shared/src/index.ts](file:///home/ayan/Projects/campus-notification-engine/packages/shared/src/index.ts)
- **Meaning** : Single barrel export plus the thin shared interfaces (`StandardError`, `ApiKeyDto`, `ChannelPreferences`).
- **Reason**  : `import { … } from '@campus/shared'` only needs one import path.

---

## 3. apps/api — NestJS Backend

### [apps/api/package.json](file:///home/ayan/Projects/campus-notification-engine/apps/api/package.json)
- **Meaning** : Dependencies and scripts for the NestJS API + Worker (single process).
- **Reason**  : `@nestjs/bullmq` (Decision 5: single-process; workers share the API process), `@nestjs/mongoose` (Mongo + transactions), `bcrypt` (API key hash + passwords), `prettier` (HTML validation — Gap 5 fix), `mongoose-delete` (Subscriber + Template soft-delete).
- **Important** : `"scripts": { "build": "nest build", "dev": "nest start --watch" }`. Jest e2e config is included (not run for this prototype).

### [apps/api/tsconfig.json](file:///home/ayan/Projects/campus-notification-engine/apps/api/tsconfig.json)
- **Meaning** : Extends the base with `paths` to `@campus/shared`.
- **Reason**  : Lets the API reference shared types without having to build shared first.

### [apps/api/nest-cli.json](file:///home/ayan/Projects/campus-notification-engine/apps/api/nest-cli.json)
- **Meaning** : Nest CLI configuration entry (`"entryFile": "main"`).
- **Reason**  : Nest build/dev commands would fail without this.

### [apps/api/src/main.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/main.ts)
- **Meaning** : Bootstrap file — creates Nest app, enables URI versioning, global ValidationPipe, CORS.
- **Reason**  : API.md requires `/v1/…` and `/v2/…` prefixes — URI versioning (`app.enableVersioning()`) is the cleanest way to match that spec.
- **Important** :
  ```
  app.enableVersioning({ type: VersioningType.URI })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.enableCors()
  ```

### [apps/api/src/app.module.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/app.module.ts)
- **Meaning** : Top-level module that wires Config (dotenv), Mongoose, BullMQ, EventEmitter2 and every feature module.
- **Reason**  : A single `AppModule` keeps the dependency graph readable (Decision 5: single process — no separate ws app).
- **Important** :
  ```
  MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-notifications')
  BullModule.forRoot({ connection: { host: REDIS_HOST, port: REDIS_PORT }, defaultJobOptions })
  EventEmitterModule.forRoot(…)   // used by worker to broadcast "message.saved" → SSE
  ```

---

## 3a. Common cross-cutting (`apps/api/src/common/`)

### [common.module.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/common/common.module.ts)
- **Meaning** : Shared common module (empty providers for now, but referenced by AppModule).
- **Reason**  : Future helpers (pagination, formatting) land here without polluting AppModule.

### [decorators/require-permissions.decorator.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/common/decorators/require-permissions.decorator.ts)
- **Meaning** : `@RequirePermissions(PermissionsEnum.WORKFLOW_WRITE)` decorator.
- **Reason**  : FR-4 RBAC. Without a decorator we would have to hard-code permission checks inside every handler. `Reflector` retrieves them in the guard.
- **Important** : `SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions)`.

### [guards/permissions.guard.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/common/guards/permissions.guard.ts)
- **Meaning** : Global `CanActivate` guard. Registered as `APP_GUARD` in `AuthModule`, so every controller route runs it.
- **Reason**  : AC-5 explicitly requires that a `WORKFLOW_READ`-only user gets **403 before any DB write occurs**. Resolving permissions at the guard layer guarantees the repository method is never even called. (Gaps.md Gap-check equivalent: Grep shows `DELETE workflows` never hits the repository when permissions fail.)
- **Important** :
  ```
  const requiredPermissions = reflector.getAllAndOverride(…)
  if (!requiredPermissions) return true;   // no decorator → skip (e.g. /auth/signup)
  const member = await memberModel.findOne({ _userId, _organizationId })
  for (role of member.roles) userPermissions.push(...ROLE_PERMISSIONS[role])
  if (!requiredPermissions.every(p => userPermissions.includes(p)))
    throw new ForbiddenException({ error: FORBIDDEN, … })
  ```
  The guard is **global** but short-circuits when a handler has no `@RequirePermissions`, so `/auth/signup` and `/auth/signin` work unauthenticated.

### [filters/all-exceptions.filter.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/common/filters/all-exceptions.filter.ts)
- **Meaning** : Global exception filter that normalises every non-2xx into the standard envelope `{ statusCode, error, message }`.
- **Reason**  : NFR-3. Without this, Nest produces inconsistent payloads (plain 500 strings, class-validator arrays, etc).
- **Important** : Handles `HttpException`, `MongoServerError`, and `unknown` fall-back.

### [helpers/crypto.helper.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/common/helpers/crypto.helper.ts)
- **Meaning** : AES-256-GCM encrypt / decrypt helpers.
- **Reason**  : Integration credentials (email SMTP passwords, FCM keys, etc.) must never be stored plaintext. Future `providers.service` uses this helper to round-trip credentials on the `Integration.credentialsEncrypted` field.

### [helpers/slugify.helper.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/common/helpers/slugify.helper.ts)
- **Meaning** : `generateStepId(stepName, attempt)` → URL-friendly step `_id` with up to 5 de-dupe attempts.
- **Reason**  : FR-6 requires step `_id`s be server-validated. On create the server assigns them (never trusts client to pick). Used in UpsertWorkflowUseCase.

---

## 3b. Auth & Users

### [auth/auth.module.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/auth/auth.module.ts)
- **Meaning** : Auth domain — wires Passport, JwtModule, services, strategies, guards.
- **Reason**  : FR-2 (JWT auth) and FR-3 (API key auth) live in one module so it can be marked `@Global()` and export `PermissionsGuard` + `JwtStrategy` + `ApiKeyAuthGuard`.
- **Important** :
  ```
  @Global() …
  JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-secret-change-me', expiresIn: '7d' })
  providers: [ AuthService, JwtStrategy, ApiKeyAuthGuard, PermissionsGuard,
               { provide: APP_GUARD, useClass: PermissionsGuard } ]
  ```
  The `APP_GUARD` entry is **critical** — it's what attaches permissions globally.

### [auth/auth.service.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/auth/auth.service.ts)
- **Meaning** : `signup()` creates User → Organization → (DEV + PROD Environments) → Member (ADMIN) → seed one API key on DevEnv atomically. `signin()` validates bcrypt password and signs a JWT.
- **Reason**  : The signup flow uses a MongoDB Client Session with `session.withTransaction()` — so if any intermediate step fails the user+org+env+member+key all roll back together. This mirrors the atomic-write pattern used for workflows (FR-5/AC-1/AC-3). The returned payload shape exactly matches dashboard expectations (`token`, `user.id`, `user.permissions`, `user.environments`).
- **Important** :
  ```ts
  // signup uses mongodb session transaction:
  const result = await session.withTransaction(async () => {
    const user = userRepo.create({…passwordHash…}, session)
    const org  = orgRepo.create({…}, session)
    const dev  = envRepo.create({ type: DEV, identifier, _organizationId: org._id }, session)
    const prod = envRepo.create({ type: PROD, … }, session)
    memberRepo.create({ _userId: user._id, roles: [ADMIN] }, session)
    // bcrypt-hash the raw API key and store only hash; return raw only at creation (FR-3):
    const rawKey = uuidv4()
    const keyHash = await bcrypt.hash(rawKey, 10)
    envRepo.updateById(devEnv._id, { $push: { apiKeys: { key: rawKey.slice(0,16), hash: keyHash, _userId: user._id.toString() } } }, session)
  })
  // return token + user shape with id/permissions/envs:
  return { token, user: { id, permissions, environments, … }, … }
  ```

### [auth/auth.controller.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/auth/auth.controller.ts)
- **Meaning** : `POST /auth/signup`, `POST /auth/signin`, `POST /auth/me`.
- **Reason**  : No version prefix — matches the dashboard `/auth` proxy in `vite.config.ts`.

### [auth/jwt.strategy.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/auth/jwt.strategy.ts)
- **Meaning** : Passport JWT strategy. Reads `Authorization: Bearer <token>`, validates, resolves the Member record, and attaches `{ _id, _organizationId, _environmentId (default Dev), roles }` onto `req.user`.
- **Reason**  : FR-1 multi-tenant isolation requires every DB write be scoped to current org+env. The strategy pins `_environmentId` to the DEV env of the first Member record. Dashboard can change it via `AuthContext.setEnvironmentId`.
- **Important** :
  ```
  const member = memberModel.findOne({ _userId: payload.sub }).sort({ createdAt: 1 })
  const devEnv = environmentModel.findOne({ _organizationId: member._organizationId, type: DEV })
  return { _id, _organizationId, _environmentId: devEnv?._id, roles }
  ```

### [auth/guards/api-key-auth.guard.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/auth/guards/api-key-auth.guard.ts)
- **Meaning** : Guard for the Trigger API: looks up the `ApiKey` header, iterates environments → compares against each stored `bcrypt(apiKey) === hash`. On match sets `req.user = { _userId, _environmentId, _organizationId }`.
- **Reason**  : FR-3. Trigger API is called with an environment-scoped API key (not JWT), so we can't reuse `JwtStrategy`. Because PermissionsGuard is global, this guard's injected `req.user` flows through to the `@RequirePermissions(EVENT_WRITE)` check.
- **Important** :
  ```
  const apiKey = req.headers['apikey'] || req.headers['ApiKey']
  for env of environmentModel.find({ 'apiKeys.key': { $exists: true } })
    for k of env.apiKeys
      if (await bcrypt.compare(apiKey, k.hash)) { req.user = {…}; return true }
  ```

### [auth/dtos/signup.dto.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/auth/dtos/signup.dto.ts)
- **Meaning** : `class-validator`-annotated DTO for signup.
- **Reason**  : Validates `email`, `password`, `firstName`, `lastName`, `organizationName` before the transaction opens.

### [auth/dtos/signin.dto.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/auth/dtos/signin.dto.ts)
- **Meaning** : Sign-in DTO (email + password).
- **Reason**  : Same validation purpose as signup.

### [users/*](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/users/)
- **Meaning** : `User` schema + repository + module (full name, email, bcrypt password, timestamps, mongoose-delete soft-delete).
- **Reason**  : Auth service uses the repository to look up users by email. Mongoose-delete (with `overrideMethods: 'all'`) guarantees default `find*`s skip deleted users but data is retained for compliance.

### [organizations/*](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/organizations/)
- **Meaning** : `Organization` schema (name, apiServiceLevel, branding) + repo + module.
- **Reason**  : FR-1 multi-tenant root entity; every Environment/Subscriber/Workflow references `_organizationId`.

### [members/*](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/members/)
- **Meaning** : `Member` schema — `_userId`, `_organizationId`, `roles: RoleEnum[]` — plus repo (findByUserId) + module.
- **Reason**  : Implements the many-to-many between Users and Organizations with a role list. PermissionsGuard resolves roles via this table. `findByUserId` is needed by sign-in (to resolve which Org's envs to return to dashboard).

### [environments/environment.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/environments/environment.schema.ts)
- **Meaning** : `Environment` — `type` (DEV/PROD, **required**, enum-restricted), `identifier` (unique), `_organizationId`, `apiKeys[]` (`{key, hash, _userId}` sub-docs).
- **Reason**  :
  - **Gap 7 fix**: Original had a `post('find')` hook that mutated returned docs to inject type. **This file has no such hooks** — type is `required: true` at document creation, so it's always present.
  - FR-1 isolation: every business schema carries `_environmentId` FK back to here.
  - FR-3 API keys stored as bcrypt hashes only, never returned post-creation.
- **Important** :
  ```ts
  @Prop({ type: String, enum: Object.values(EnvironmentTypeEnum), required: true })
  type: EnvironmentTypeEnum;       // Gap 7 — never injected by post hook
  @Schema plugin(mongooseDelete, { overrideMethods: 'all' })
  ```
  Grep for `post('find` in this file — **zero matches** (GAP-6 check against the pattern in GAPS.md).

### [environments/environment.repository.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/environments/environment.repository.ts)
- **Meaning** : CRUD for `Environment` plus `findByApiKeyHash` (unused, legacy helper) and `listForOrganization(orgId)`.
- **Reason**  : `listForOrganization` is what `AuthService.signin()` calls to return the environments list to the dashboard, and what the new `EnvironmentsController` exposes at `GET /v1/environments` for AuthContext `loadEnvironments()`.

### [environments/environments.controller.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/environments/environments.controller.ts)
- **Meaning** : `GET /v1/environments` — returns `{ data: Environment[] }` for the caller's organization.
- **Reason**  : The dashboard `AuthContext.loadEnvironments()` issues this request to populate the environment picker.

### [environments/environments.module.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/environments/environments.module.ts)
- **Meaning** : Wires the schema, repo, controller and exports them.
- **Reason**  : Exporting `EnvironmentRepository` + `MongooseModule` lets other modules (Auth, Workflows, Subscribers) reference the model/repo without re-registering it.

---

## 3c. Workflows V2 (`/v2/workflows`)

### [workflows-v2/notification-template.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/notification-template.schema.ts)
- **Meaning** : `NotificationTemplate` is the persisted workflow: `name`, `steps: WorkflowStep[]`, `triggers: WorkflowTrigger[]`, `tags`, plus `_environmentId`, `_organizationId`.
- **Reason**  :
  - FR-5 (workflow CRUD) and FR-7 (channel step types).
  - **Gap 6 fix**: GAPS.md Part-A documents deprecated compound indexes on NotificationTemplate. **This file explicitly adds only two indexes**: `{ _environmentId: 1, 'triggers.identifier': 1 }` (used by TriggerService.findByTriggerIdentifier) and `{ _environmentId: 1, _id: 1 }`. The deprecated compound indexes are not present.
  - Mongoose-delete soft-delete (archive, not destroy) so dashboard can restore.
- **Important** :
  ```ts
  // WorkflowStep embedded doc:
  _id: string (client-provided but SERVER-VALIDATED by usecase),
  name: string,
  type: ChannelTypeEnum,        // EMAIL | IN_APP | SMS | PUSH | DIGEST | DELAY
  template: { subject, html, body, title },
  controls: Record<string, any>,
  digestKey?, delayAmount?, delayUnit?, critical?: boolean
  ```
  `critical` flag is read by `DigestWindowService`: critical events bypass digest during exam periods (AC-10: non-critical held, critical delivered immediately).

### [workflows-v2/control-values.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/control-values.schema.ts)
- **Meaning** : Separate collection for control values (`_workflowId`, `_stepId`, `_environmentId`, `level: DigestLevelEnum`, `controls`, `providerId`).
- **Reason**  : Separate collection is **why we need atomic writes**. ControlValues could have been embedded on steps, but ARCHITECTURE/PRD follows the spec where they're separate, so FR-5 (atomic writes, AC-1, AC-3) guarantees both NotificationTemplate + ControlValues either persist together or rollback together.
- **Important** : `{ _workflowId, _stepId, _environmentId, level }` is the natural key; repository uses `bulkWrite([{ updateOne: { filter, upsert: true } } …])`.

### [workflows-v2/notification-template.repository.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/notification-template.repository.ts)
- **Meaning** : CRUD for NotificationTemplate, plus `findByTriggerIdentifier(environmentId, identifier)`.
- **Reason**  : Every create/update/delete accepts an optional `ClientSession` — this is how UpsertWorkflowUseCase passes the active transaction session into the write.
- **Important** : `create([data], session ? { session } : {})`. Without the session parameter, mongoose writes outside the transaction and the rollback would be partial (Gap 1).

### [workflows-v2/control-values.repository.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/control-values.repository.ts)
- **Meaning** : CRUD for ControlValues, plus `bulkWrite(ops, session)`.
- **Reason**  : Session-aware bulk upsert for control values in the same transaction as NotificationTemplate.

### [workflows-v2/usecases/upsert-workflow.usecase.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/usecases/upsert-workflow.usecase.ts)
- **Meaning** : The heart of workflow create/update. Opens a MongoDB Client Session, runs `session.withTransaction` wrapping both (1) NotificationTemplate insert/update and (2) ControlValues bulkWrite. Handles:
  - step `_id` ownership validation (Gap 4 fix).
  - HTML prettier validation with clear throw (Gap 5 fix — no silent swallow).
  - Step id slugification with retry.
- **Reason**  :
  - **Gap 1 fix / AC-1 / AC-3**: `session.withTransaction` guarantees if ControlValues write throws, the NotificationTemplate insert is **rolled back** atomically. There is no partial NotificationTemplate left in the DB (AC-3 pass condition).
  - **Gap 4 fix (STEP_NOT_IN_WORKFLOW)**: existing step IDs are loaded from the DB and incoming step._ids outside that set cause a 400 before any write. Client cannot inject step IDs belonging to other workflows.
  - **Gap 5 fix**: Original swallowed prettier errors via `logger.warn`. This file `throw`s a `BadRequestException(MALFORMED_HTML)` on format failure — never swallowed.
- **Important** :
  ```ts
  const session = await connection.startSession();
  try {
    return await session.withTransaction(async () => {
      // 1) ownership check
      const existingStepIds = new Set(existing.steps.map(s => s._id))
      for (step of dto.steps)
        if (step._id && !existingStepIds.has(step._id))
          throw new BadRequestException(STEP_NOT_IN_WORKFLOW)    // Gap 4

      // 2) HTML validation (Gap 5: throw, no swallow)
      if (step.type === EMAIL && step.template?.html)
        try { prettier.format(step.template.html, { parser: 'html' }) }
        catch { throw new BadRequestException(MALFORMED_HTML) }   // Gap 5

      // 3) atomic writes
      const template = existing ? templateRepo.updateById(…, session)
                                : templateRepo.create(…, session)
      if (controlValues.length) controlValuesRepo.bulkWrite(bulkOps, session)
      return template
    });
  } finally { session.endSession() }
  ```

### [workflows-v2/usecases/sync-workflow.usecase.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/usecases/sync-workflow.usecase.ts)
- **Meaning** : Copies a workflow from one environment to another (within the same Org).
- **Reason**  : Controller exposes `PUT /v2/workflows/:id/sync`. Lets admin move a validated workflow from DEV → PROD.

### [workflows-v2/workflows-v2.controller.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/workflows-v2.controller.ts)
- **Meaning** : REST controller for `/v2/workflows`: GET (list), GET :id, POST (create via usecase), PUT :id, PATCH :id (merge + usecase), DELETE :id (soft-delete), PUT :id/sync.
- **Reason**  : FR-5. Every handler is `@UseGuards(AuthGuard('jwt'))` and individually protected with `@RequirePermissions(WORKFLOW_READ / WORKFLOW_WRITE)`, so AC-5 can be evaluated (403 before repo call).
- **Important** : Env scope injected via `req.user._environmentId` — list only shows workflows for the caller's environment (AC-6).

### [workflows-v2/workflows-v2.module.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/workflows-v2.module.ts)
- **Meaning** : Wires schemas, repositories, usecases, controller.
- **Reason**  : Exports repositories so TriggerService and DigestService can read workflows.

### [workflows-v2/dtos/*.dto.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/workflows-v2/dtos/)
- **Meaning** : `UpsertWorkflowDto` (name, description, active, steps, triggers, controlValues, tags, parent) and `WorkflowStepDto`.
- **Reason**  : Nest global ValidationPipe uses class-validator decorators on these DTOs to reject malformed payloads before usecases run.

---

## 3d. Subscribers (`/v2/subscribers`)

### [subscribers/subscriber.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/subscribers/subscriber.schema.ts)
- **Meaning** : Subscriber document: `subscriberId`, first/last name, email, phone, locale, timezone, channels (per-channel enabled preferences), `_environmentId`, `_organizationId`.
- **Reason**  :
  - FR-10: uniqueness scoped to `(subscriberId, environment)` where `deleted=false`. Implemented as a **partial unique index**.
  - FR-11: `channels.email.enabled` (etc.) is what the worker consults before dispatch (AC-8 channel-preference test).
  - Mongoose-delete soft-delete with `overrideMethods: 'all'` so default queries skip deleted subscribers while the partial index permits re-creating a subscriber with the same subscriberId after soft-delete.
- **Important** :
  ```ts
  SubscriberSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all', indexFields: ['deleted'] })
  SubscriberSchema.index(
    { subscriberId: 1, _environmentId: 1 },
    { unique: true, partialFilterExpression: { deleted: false } }   // FR-10 + AC-4
  )
  ```

### [subscribers/subscriber.repository.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/subscribers/subscriber.repository.ts)
- **Meaning** : CRUD for Subscriber plus `findBySubscriberId()` and **the critical E11000 → ConflictException rethrow**.
- **Reason**  : **Gap 2 fix / AC-4 (structured 409)**. Original turned duplicate subscriber into a raw HTTP 500. This repository wraps create in a `try/catch` and `if (err.code === 11000)` throws NestJS `ConflictException({ error: SUBSCRIBER_ALREADY_EXISTS, message })`. The controller returns HTTP 409 (not 500).
- **Important** :
  ```ts
  async create(data, session?) {
    try { return (await model.create([data], session?{session}:{}))[0] }
    catch (err) {
      if (err && err.code === 11000) throw new ConflictException({
        error: ErrorCode.SUBSCRIBER_ALREADY_EXISTS,
        message: 'Subscriber with this subscriberId already exists in this environment',
      })
      throw err
    }
  }
  ```

### [subscribers/subscribers.controller.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/subscribers/subscribers.controller.ts)
- **Meaning** : CRUD controller for `/v2/subscribers` (GET list/search, GET :id, POST create, PUT :id, DELETE soft-delete).
- **Reason**  : PUT handler merges channel preferences (never overwrites the whole channels object wholesale) because the dashboard sends per-channel toggle updates.
- **Important** : Routes scoped to `req.user._environmentId` — subscribers in DEV invisible from PROD (AC-6).

### [subscribers/dtos/upsert-subscriber.dto.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/subscribers/dtos/upsert-subscriber.dto.ts)
- **Meaning** : DTO for create/update.
- **Reason**  : Validation plus `channels` structure matches the schema so the merged-preferences logic in PUT works correctly.

---

## 3e. Trigger API + Worker Pipeline

### [events/events.module.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/events/events.module.ts)
- **Meaning** : Registers the BullMQ `notification-dispatch` queue, imports every module required by the worker, exports TriggerService + BullModule + ProviderRegistry.
- **Reason**  : DigestModule must be imported here so TriggerService can inject `DigestService.collect()` for DIGEST steps (without this line, burst digest + academic calendar would be skipped entirely — this is the integration point fixed during the build).

### [events/trigger.service.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/events/trigger.service.ts)
- **Meaning** : Implements the Trigger API use case: validates the workflow exists, ensures subscriber exists (auto-creates with minimal fields if needed), creates a `Notification` record, then for each step either:
  - `DELAY` → accumulates into `accumulatedDelayMs` applied to the next non-delay step.
  - `DIGEST` → calls `DigestService.collect()` to store payload in Redis and schedule a flush (**AC-7 + AC-10**).
  - Other channels → creates a `Job` record, enqueues BullMQ job with retries/exponential backoff (**AC-9 retry without duplicate**).
- **Reason**  :
  - FR-12 (trigger API contract `acknowledged + transactionId`).
  - DELAY accumulation solves the case `[delay 5m → email → in_app]`: the email waits 5m and in_app is also delayed by 5m.
  - DIGEST routing is the **critical fix** that was missing previously: without it, all DIGEST steps were silently `continue`d and AC-7/AC-10 would never produce a digest Message.
- **Important** :
  ```ts
  const workflow = templateRepo.findByTriggerIdentifier(context._environmentId, dto.name)
  // auto-create subscriber if missing
  if (!subscriber) subscriber = subscriberRepo.create({…}, session-less)
  const transactionId = uuidv4()
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]
    if (step.type === DELAY) { accumulatedDelayMs += getStepDelayMs(step); continue }
    if (step.type === DIGEST) {
      const res = await digestService.collect({
        subscriberId, environmentId, organizationId,
        digestKey: step.digestKey || `default-${step._id||i}`,
        workflowId, stepId: step._id || `step-${i}`,
        payload, critical: !!step.critical, transactionId,
      })
      // create a Job row (for tracking); windowMinutes returned by digest service
      jobs.push({ kind: 'digest', windowMinutes: res.windowMinutes })
      continue
    }
    // normal dispatch step:
    const bullJob = await queue.add(`dispatch:${step.type}:${job._id}`, payload, {
      attempts: 5, backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true, delay: totalDelay,
    })
  }
  return { acknowledged: true, transactionId, notificationId, jobs }
  ```

### [events/events.controller.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/events/events.controller.ts)
- **Meaning** : `POST /v1/events/trigger` with `ApiKeyAuthGuard` + `@RequirePermissions(EVENT_WRITE)`.
- **Reason**  : API.md + FR-12 specify ApiKey auth (not JWT) for integrator-triggered events.

### [events/dtos/trigger-event.dto.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/events/dtos/trigger-event.dto.ts)
- **Meaning** : DTO for trigger: `name` (workflow trigger identifier), `subscriber { subscriberId, firstName, lastName, email, phone }`, `payload: Record`.
- **Reason**  : Validation.

### [events/notification-dispatch.worker.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/events/notification-dispatch.worker.ts)
- **Meaning** : BullMQ `@Processor(NOTIFICATION_QUEUE)` — worker that dequeues each dispatch step and performs: resolve Workflow + Subscriber → render template → check channel preference → select provider → dispatch → dedup-insert Message + ExecutionDetail.
- **Reason**  : Implements FR-13, FR-14, FR-15, FR-16, AC-2, AC-8, AC-9.
- **Important** :
  - **Channel preference check (AC-8)**:
    ```
    const channelPref = subscriber.channels?.[data.channel]
    if (channelPref?.enabled === false) {
      // write a "success: skipped (channel_muted)" ExecutionDetail and return.
    }
    ```
    → An email-muted subscriber will not create an email Message, but will still create the in_app Message (AC-8 condition: email count === 0, in_app count === 1).
  - **Content rendering**: `{{variable}}` substitution with nested paths, using `controlValues` merged with trigger `payload` and `subscriber` fields.
  - **IN_APP provider shortcut**: for `in_app` channel we skip the provider registry entirely and write the Message directly, then emit `message.saved` event for SSE.
  - **Dedup insert (AC-9)**:
    ```
    messageRepo.insertIfNotExists(messageData)
    ```
    Together with Message schema's `{ transactionId, _subscriberId, _environmentId, channel }` unique index → any retry that hits the same dedup key returns the existing row instead of inserting a duplicate. The BullMQ retry loop (attempts: 5, exponential backoff) can safely re-run without producing duplicate Messages (AC-9 count ===1).
  - Retries fail the job with `throw Error()` at the very end: BullMQ catches this, records failure, applies backoff, re-queues. On 5th failure the job is left in `failed` (due to `removeOnFail: false` in trigger.service) for debugging.

### [events/providers/provider-registry.service.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/events/providers/provider-registry.service.ts)
- **Meaning** : Provider registry + a built-in `nodemailer-stub` (always succeeds).
- **Reason**  : FR-15: Email (stub) provider. The prototype's Email provider is stubbed so sending always succeeds without real SendGrid credentials. The registry returns the stub for EMAIL when no real provider is configured → AC-2 can pass within 30s without credentials.
- **Important** : The stub dispatch returns `{ success: true, providerResponse: { stub: true } }` and the worker then writes an ExecutionDetail.status=success for the transaction (AC-2 pass condition).

### [jobs/job.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/jobs/job.schema.ts)
- **Meaning** : Job record per-step: `_notificationId`, `_subscriberId`, `_environmentId`, `status`, `type`.
- **Reason**  : Durable record of per-step state. Worker updates `status` on success/failure so activity feed can show per-step status per transaction without querying BullMQ internals.

### [notifications/notification.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/notifications/notification.schema.ts)
- **Meaning** : Notification (one per trigger call): `_templateId`, `_subscriberId`, `_environmentId`, `transactionId`, `payload`.
- **Reason**  : Transaction root. The activity feed joins Messages + ExecutionDetails through `_notificationId` and `transactionId`.

### [execution-details/execution-detail.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/execution-details/execution-detail.schema.ts)
- **Meaning** : Per-step delivery record: `_notificationId`, `_jobId?`, `status`, `isTest`, `detail`.
- **Reason**  : FR-18 Activity Feed: each dispatch attempt writes one row. A skipped (muted) channel writes `success + detail.skipped=true, reason=channel_muted` so the feed shows channel-level status per-message (sent/skipped/error).

---

## 3f. Digests + Academic Calendar (Differentiator, AC-7 & AC-10)

### [digest/digest-window.service.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/digest/digest-window.service.ts)
- **Meaning** : Computes the digest window in minutes as a function of environment's current academic period and the step's `critical` flag.
- **Reason**  : **FR-21 / AC-10 differentiator**. Digest window is NOT a hard-coded 5 minutes — it adapts to academic context:
  ```
  critical = true     → 0 minutes (immediate flush)
  REGULAR_WEEK        → 5 min
  EXAM_PERIOD         → 60 min  (non-critical: held much longer during exams)
  HOLIDAY             → 120 min
  ORIENTATION         → 15 min
  ```
  When academic calendar is missing, defaults to `REGULAR_WEEK` (5 min), satisfying AC-7 default burst case.

### [digest/digest.service.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/digest/digest.service.ts)
- **Meaning** : Two classes in one file:
  1. **`DigestService`** (Injectable) — `collect()` writes the payload into a Redis hash keyed by `digest:env:workflow:step:digestKey:subscriberId` (hash field=uuid, value=JSON). Then schedules exactly one delayed BullMQ flush job (jobId=`scheduled:${key}`) to run after the window returned by `DigestWindowService`. Scheduled only once because `digestQueue.getJob(scheduledJobId)` skips enqueueing if the delayed job is already booked.
  2. **`DigestFlushWorker`** (`@Processor(DIGEST_QUEUE)`) — when the delayed job fires: reads every payload from the Redis hash, deletes the hash, resolves workflow + step + subscriber, renders aggregate HTML/body, inserts a single dedup'd Message, emits `message.saved` for SSE.
- **Reason**  : **AC-7 (burst digest)** — 10 triggers within 5 minutes all hit `collect()` and append to the same Redis hash; exactly one delayed flush job runs and produces **one** Message. Because the delayed job is already scheduled (jobId dedupe check), repeat events do **not** schedule new windows. The count at the end is exactly 1.
- **Important** :
  ```
  // collect():
  redis.hset(key, eventId, JSON.stringify({payload, transactionId, timestamp}))
  const windowMin = digestWindowService.getWindowMinutes(...)
  const scheduledJobId = `scheduled:${key}`
  if (!await digestQueue.getJob(scheduledJobId))
    digestQueue.add(flush_job_data, { jobId: scheduledJobId, delay: windowMin * 60 * 1000, … })

  // flush worker:
  const collected = redis.hgetall(hashKey)
  // if zero entries → skip
  events.push(...JSON.parse(Object.values(collected)))
  redis.del(hashKey)
  // renderDigest(payloads[], vars) → aggregate wrap using {{count}}, {{items}}
  messageRepo.insertIfNotExists({ …transactionId: events[0].transactionId… })
  ```

### [integrations/academic-calendar.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/integrations/academic-calendar.schema.ts)
- **Meaning** : AcademicCalendar document: `_environmentId`, `period: AcademicPeriodEnum`, `effectiveFrom: Date`, `effectiveTo: Date`, `_organizationId`.
- **Reason**  : FR-20. Admin can create multiple overlapping or sequential entries; `getCurrentPeriodForEnvironment()` picks the one whose range contains `now`, ordering by `effectiveFrom: -1` to prefer latest-created when two ranges overlap. Without this document for an environment, DigestWindowService falls back to `REGULAR_WEEK`.

### [integrations/academic-calendar.repository.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/integrations/academic-calendar.repository.ts)
- **Meaning** : CRUD + the key method `getCurrentPeriodForEnvironment(environmentId, now?)` used by DigestWindowService.
- **Reason**  : Encapsulates the "which period is active now?" lookup so it's testable (caller can inject fake `now`).

---

## 3g. Integrations

### [integrations/integration.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/integrations/integration.schema.ts)
- **Meaning** : Integration record: `providerId` (`sendgrid`, `nodemailer-stub`, `twilio`, `fcm`, `in-app`), `channel`, `credentialsEncrypted` (AES-256-GCM ciphertext), `active`, `_environmentId`, `_organizationId`.
- **Reason**  : FR-15: provider configuration per environment. Worker uses IntegrationRepository.findActiveByChannel() to look up the configured provider for a given channel+env, falling back to the stub provider when none is configured.

### [integrations/integration.repository.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/integrations/integration.repository.ts)
- **Meaning** : CRUD + findActiveByChannel(environmentId, channel).
- **Reason**  : Encapsulates the lookup the worker needs.

### [integrations/integrations.controller.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/integrations/integrations.controller.ts)
- **Meaning** : CRUD endpoints for integrations and academic-calendar endpoints.
- **Reason**  : FR-15, FR-20. Admin creates/activates an email stub integration or changes the current academic period via these endpoints.

### [integrations/providers.service.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/integrations/providers.service.ts)
- **Meaning** : Thin wrapper that adds `crypto.helper` round-trip for `credentialsEncrypted` before passing to the registry.
- **Reason**  : Credentials never decrypted in Controller. Decryption is isolated to this service.

---

## 3h. Messages (Inbox + TTL, no soft-delete hooks — Gap 3 fix)

### [messages/message.schema.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/messages/message.schema.ts)
- **Meaning** : Message document (one per delivery): `channel`, `content`, `subject?`, `seen`, `read`, `archived`, `snoozedUntil`, `status`, `transactionId`, foreign keys to Template/Notification/Subscriber/Job/Environment/Org, timestamps.
- **Reason**  :
  - **Gap 3 fix — NO soft-delete pre-hooks**. GAPS.md Part-A documents the original using `pre('find')`, `pre('findOne')`, `pre('findOneAndUpdate')`, `pre('countDocuments')` hooks that silently filtered `deleted:false`. These break index usage and cause subtle query bugs. **This file has ZERO pre-hooks** — instead of soft-delete, `archived` is a plain boolean and the entire collection has a **TTL index** expiring messages after 90 days from `createdAt`.
  - Dedup unique index `(transactionId, _subscriberId, _environmentId, channel)` → AC-9 (retry-without-duplicate) enforcement at DB layer.
  - Inbox compound index `(_subscriberId, _environmentId, channel, seen, read, archived, snoozedUntil, createdAt:-1)` → inbox list queries use the index, not a collection scan.
- **Important** :
  ```
  MessageSchema.index(
    { _subscriberId:1, _environmentId:1, channel:1, seen:1, read:1, archived:1, snoozedUntil:1, createdAt:-1 },
    { name: 'inbox_compound' }
  )
  MessageSchema.index(
    { transactionId:1, _subscriberId:1, _environmentId:1, channel:1 },
    { unique: true, name: 'dedup_compound' }
  )
  MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 })  // Gap 3 — TTL in place of soft-delete
  ```
  Grep `pre('find` in this file — zero occurrences (Gap 3 check).

### [messages/message.repository.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/messages/message.repository.ts)
- **Meaning** : CRUD + count + the crucial `insertIfNotExists(data, session?)`.
- **Reason**  : `insertIfNotExists` pairs with the dedup unique index (AC-9): first it does `findOne(dedupKey)`; if row exists, returns the existing document. If not, create. If a race condition slips the check, create throws `code=11000`, and the catch block does `findOne(dedupKey)` again. Either way the caller gets back exactly one Message (no duplicates ever inserted).

---

## 3i. Activity Feed + SSE Real-Time + Inbox Endpoints

### [activity/activity.controller.ts](file:///home/ayan/Projects/campus-notification-engine/apps/api/src/modules/activity/activity.controller.ts)
- **Meaning** : Controller exposing:
  1. `GET /v1/activity` — ExecutionDetails pagination, scoped to caller's org/env (NOTIFICATION_READ permission). FR-18 / AC-2 evidence query.
  2. `SSE /v1/sse` — `text/event-stream` JWT-authenticated endpoint. Pushes ping every 30s + `notification_received` events when the EventEmitter handler (`@OnEvent('message.saved')`) matches the connection's subscriberId.
  3. `GET /v1/inbox` — Messages (non-archived default) for the subscriber.
  4. `POST /v1/messages/:id/seen|read|archive` — status updates.
- **Reason**  :
  - FR-18: Activity feed is an evaluator AC-2 evidence endpoint (can poll for `ExecutionDetail.status === success`).
  - FR-14 / Decision 5: SSE replaces a separate ws app (single-process constraint). The EventEmitter bridge between worker → SSE listener keeps them in-process.
  - Inbox endpoints implement FR-14 mark-seen/read/archive UI in dashboard InboxPage.
- **Important** :
  ```
  // SSE bridge:
  @OnEvent('message.saved')
  handleMessageSaved({ message }) {
    for ctx of sseConnections.values()
      if (ctx.subscriberId === String(msg._subscriberId))
        ctx.subject.next({
          type: 'notification_received',
          data: { messageId, channel, content, subject, createdAt, transactionId },
        })
  }
  ```
  Every `messageRepo.insertIfNotExists` on IN_APP channel in worker + digest flush worker emits `message.saved`; the controller fans it out to the right SSE subscribers.

---

## 4. apps/dashboard — React + Vite + Tailwind SPA

### [dashboard/package.json](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/package.json)
- **Meaning** : Dependencies: React 18, React Router 6, axios, date-fns, clsx, event-source-polyfill, react-hook-form, Tailwind.
- **Reason**  : Matches user profile preferences (React + Tailwind CSS). `event-source-polyfill` is required for broad SSE support (Firefox etc.).

### [dashboard/vite.config.ts](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/vite.config.ts)
- **Meaning** : Vite config with React plugin + proxy rules: `/v1`, `/v2`, `/auth` → `http://localhost:3000`.
- **Reason**  : In dev, API runs on port 3000, Vite on 5173. Proxying avoids CORS for JWT and keeps fetch URLs as `/v1/…` in both dev and production (if behind a reverse proxy that terminates the same host).

### [dashboard/tsconfig.json / tsconfig.node.json](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/tsconfig.json)
- **Meaning** : TS strict mode. `types` include `vite/client`.
- **Reason**  : NFR-4 strict mode consistent with API.

### [dashboard/tailwind.config.js](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/tailwind.config.js)
- **Meaning** : Tailwind config pointing `content` globs at `./index.html` and `src/**/*.{ts,tsx}`.
- **Reason**  : Without this Tailwind tree-shakes every class not literally present and UI breaks.

### [dashboard/index.html](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/index.html)
- **Meaning** : Vite entry — mount point `#root` + title.

### [dashboard/src/index.css](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/index.css)
- **Meaning** : Contains `@tailwind base/components/utilities` directives.
- **Reason**  : Required for Tailwind classes to work in JSX.

### [dashboard/src/lib/api.ts](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/lib/api.ts)
- **Meaning** : Axios instance with baseURL empty (hits Vite proxy). Request interceptor: injects `Authorization: Bearer <JWT>` from `localStorage.campus_jwt`. Response interceptor: on 401 → clears storage + redirects `/signin`.
- **Reason**  : Shared axios singleton so every page (Workflows, Subscribers, Activity, Inbox) doesn't repeat the auth injection.

### [dashboard/src/context/AuthContext.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/context/AuthContext.tsx)
- **Meaning** : Central React Context: `AuthProvider` stores JWT + user + environment in localStorage, exposes `signin(email, pwd)` / `signup(payload)` / `signout()` / `setEnvironmentId(id)` / `hasPermission(perm)`.
- **Reason**  : All ProtectedRoute and every page reads the user & token from exactly one place.
- **Important** :
  ```ts
  // Local dashboard enum — duplicates the subset of shared PermissionsEnum relevant to UI and adds dashboard-only tokens:
  export enum PermissionsEnum { WORKFLOW_READ, ACTIVITY_READ, INBOX_READ, … }
  // hasPermission is used by ProtectedRoute:
  hasPermission = (perm) => user.permissions.includes(perm) (or true when no perms list yet)
  // loadEnvironments: calls GET /v1/environments, persists first dev env to localStorage if none.
  ```

### [dashboard/src/components/ProtectedRoute.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/components/ProtectedRoute.tsx)
- **Meaning** : HOC. If not authenticated, redirects to `/signin`. If `permissions` prop is provided, calls `hasPermission(perms)` and if insufficient shows a 403-style message.
- **Reason**  : FR-22 dashboard auth. Wraps Layout and each individual inner route with its specific permission (activity needs ACTIVITY_READ, inbox needs INBOX_READ).

### [dashboard/src/components/Layout.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/components/Layout.tsx)
- **Meaning** : Sidebar nav (Workflows / Subscribers / Activity / Inbox) + topbar (user info, env switcher, sign out). Renders `<Outlet />` in the content area.
- **Reason**  : Consistent UX across all dashboard pages. Env switcher calls `AuthContext.setEnvironmentId()` so the user can toggle Dev/Prod scoping (AC-6 evidence).

### [dashboard/src/pages/SignInPage.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/pages/SignInPage.tsx)
- **Meaning** : Email + password form. Calls `POST /auth/signin`, redirects to `/workflows` on success.
- **Reason**  : FR-22. Uses `react-hook-form` for input validation and UX.

### [dashboard/src/pages/SignUpPage.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/pages/SignUpPage.tsx)
- **Meaning** : Sign up form (email, password, firstName, lastName, organizationName). Calls `POST /auth/signup`, on success saves token + user + redirects, and the backend creates Org + Dev/Prod Environments + seeded API key atomically.
- **Reason**  : FR-22. Evaluators can get a complete tenant with one click.

### [dashboard/src/pages/WorkflowsPage.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/pages/WorkflowsPage.tsx)
- **Meaning** : List view of workflows loaded from `GET /v2/workflows`. Each row shows name, status, steps count, active toggle (`PATCH /v2/workflows/:id { active: nextActive }`), edit button, delete button. Embeds the `WorkflowEditorPage` component as a drawer (`editorOpen` state).
- **Reason**  : FR-23. The inline editor means Create/Edit happens without a route change.

### [dashboard/src/pages/WorkflowEditorPage.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/pages/WorkflowEditorPage.tsx)
- **Meaning** : Workflow create/edit form: name, description, trigger identifier, and a step editor (add step: select channel type, fill subject/body). On save calls `POST /v2/workflows` or `PUT /v2/workflows/:id`.
- **Reason**  : FR-23 step editing. The server performs step-ownership validation and HTML validation; errors are surface in an inline alert banner.

### [dashboard/src/pages/SubscribersPage.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/pages/SubscribersPage.tsx)
- **Meaning** : Subscriber list + create modal + edit panel. Each subscriber exposes per-channel toggles (enable email / sms / push / in_app) which call `PUT /v2/subscribers/:id { channels: { email: { enabled:false } } }` merged server-side.
- **Reason**  : FR-24 CRUD + FR-11 channel preferences. Evaluator uses this page to set AC-8 ("email muted") condition before triggering an email+in_app workflow.

### [dashboard/src/pages/ActivityPage.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/pages/ActivityPage.tsx)
- **Meaning** : Loads `GET /v1/activity` with pagination; renders status chips and per-channel status grouped by transactionId.
- **Reason**  : FR-25 + AC-2 visual evidence (admin can see a transaction's email step went to `success` within 30s of trigger).

### [dashboard/src/pages/InboxPage.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/pages/InboxPage.tsx)
- **Meaning** : Real-time In-App Inbox page: on mount opens an `EventSource('/v1/sse')` with `Authorization: Bearer <token>` (via URL query workaround for EventSource header limitation); merges incoming `notification_received` events into the list without a full refresh; "mark read" and "archive" buttons call the matching POST endpoints.
- **Reason**  : FR-26 + SSE endpoint (Decision 5: no ws app needed). Demonstrates AC-2 + AC-7 end-to-end because an admin can trigger 10 burst events and watch exactly one digest message appear (not 10 individual).

### [dashboard/src/main.tsx](file:///home/ayan/Projects/campus-notification-engine/apps/dashboard/src/main.tsx)
- **Meaning** : React entry: `createBrowserRouter` with routes signin/signup + `<ProtectedRoute><Layout/></ProtectedRoute>` parent with children /workflows, /subscribers, /activity, /inbox (each wrapped in permission-specific ProtectedRoutes). Default index redirects `/` → `/workflows`. Router wrapped in `<AuthProvider>`.
- **Reason**  : Central routing. Permission-specific wrappers ensure that if an admin manually navigates `/activity`, the UI enforces the same RBAC tokens the API will re-enforce on the fetch (defense in depth).

---

## 5. Submission cross-reference (checklist)

| AC / Gap                              | Primary Files That Prove It                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 Atomic create workflow           | UpsertWorkflowUseCase (session.withTransaction), NotificationTemplate+ControlValues repos (session-param create/update)           |
| AC-2 Trigger & Delivery <30s          | TriggerService, NotificationDispatchWorker, ExecutionDetailRepo, ActivityController (status field evidence)                       |
| AC-3 Rollback on partial failure      | UpsertWorkflowUseCase session.withTransaction: if ControlValues throws, NotificationTemplate rolled back (no doc left in DB)       |
| AC-4 409 duplicate subscriber         | SubscriberSchema partial unique index, SubscriberRepository try/catch E11000 → ConflictException(SUBSCRIBER_ALREADY_EXISTS)       |
| AC-5 403 before DB write              | PermissionsGuard (global APP_GUARD): throws 403 before handler invocation → repository methods not called                          |
| AC-6 Env isolation                    | Schemas carry _environmentId FK; controllers filter by req.user._environmentId; Subscribers list filtered by envId                |
| AC-7 Burst digest 5min                | DigestService.collect delayed job dedupe by scheduled jobId; DigestFlushWorker inserts single Message                              |
| AC-8 Channel preference (muted email) | NotificationDispatchWorker: `channels[data.channel]?.enabled===false` → skip, write skipped ExecutionDetail, no email Message      |
| AC-9 Retry w/o duplicate              | Message dedup unique index + MessageRepo.insertIfNotExists; BullMQ attempts=5 with backoff can not insert twice                    |
| AC-10 Academic calendar (exam 60min)  | DigestWindowService (EXAM_PERIOD → 60 min, critical bypass), AcademicCalendarRepo.getCurrentPeriodForEnvironment                    |
| Gap 1 Non-atomic writes               | UPSERT USECASE uses session.withTransaction (fix) — grepping for sequential create-then-controlValues with no session → 0          |
| Gap 2 E11000 → 500                    | SubscriberRepo catches E11000, throws ConflictException with structured code → 409 not 500                                        |
| Gap 3 Message pre hooks block indexes | Grep `pre('find` in message.schema.ts → 0 occurrences (Gap 3 fixed). TTL index used instead of deleted pre-hooks                   |
| Gap 4 Client-trusted step._id         | UpsertWorkflowUseCase: existingStepIds Set → BadRequest(STEP_NOT_IN_WORKFLOW)                                                       |
| Gap 5 HTML prettier swallow           | UpsertWorkflowUseCase: catch+throw MALFORMED_HTML, no catch-without-throw                                                          |
| Gap 6 Deprecated indexes on template  | NotificationTemplate schema only adds envId/triggers.identifier + envId/_id. Grep deprecated → 0                                  |
| Gap 7 env post-hook type mutation     | Environment.schema has `type: { enum, required: true }` (no post hooks). Grep post('find in this file → 0                           |

This concludes the per-file documentation. To run the prototype: `docker compose up` (MongoDB + Redis), `npm install`, `npm run dev` (starts API at 3000 + Dashboard at 5173), then sign up at http://localhost:5173/signup and exercise the flows above.
