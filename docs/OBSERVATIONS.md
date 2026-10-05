# OBSERVATIONS.md

> Source: Reverse-engineering of the Novu notification platform codebase during Stages 0–8.
> Tags: [Confirmed] = line re-read and proven. [Likely] = strong indirect evidence, no single line proof.
> All claims marked [Guess] have been dropped.

---

## 1. Tech Stack

- The backend is built with NestJS and TypeScript in a monorepo managed by NX.
  Evidence: `apps/api/package.json` [Confirmed]

- The frontend dashboard is a React + Vite SPA using React Router v6 (`createBrowserRouter`).
  Evidence: `apps/dashboard/src/main.tsx:5` [Confirmed]

- The primary database is MongoDB accessed via Mongoose ODM.
  Evidence: `libs/dal/src/repositories/user/user.schema.ts:1` [Confirmed]

- Redis is used for queues (BullMQ) and pub/sub.
  Evidence: `apps/worker/package.json`, `apps/ws/package.json` [Confirmed]

- ClickHouse is present as a secondary analytics store.
  Evidence: `apps/api/package.json` [Confirmed]

- The data access layer (DAL) lives entirely in `libs/dal/src/repositories/`.
  Evidence: `libs/dal/src/repositories/` directory listing [Confirmed]

---

## 2. Repository Layout

- There are 43 repository directories under `libs/dal/src/repositories/`.
  Evidence: `libs/dal/src/repositories/` directory listing [Confirmed]

- Business logic lives in `libs/application-generic/src/usecases/`.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts` [Confirmed]

- The API app lives at `apps/api/src/app/`, with one sub-directory per domain controller.
  Evidence: `apps/api/src/app/` directory listing [Confirmed]

- The frontend pages live at `apps/dashboard/src/pages/` and are each imported into one central router file.
  Evidence: `apps/dashboard/src/main.tsx:12-91` [Confirmed]

---

## 3. Authentication & Authorization

- Every NestJS controller in `apps/api/src` uses `@RequireAuthentication()` at the class level (applied as a decorator), enforcing that all routes in that controller require a valid session.
  Evidence: `apps/api/src/app/workflows-v2/workflow.controller.ts:82` [Confirmed]

- Fine-grained permissions use `@RequirePermissions(PermissionsEnum.X)` at the handler level, checked per-route.
  Evidence: `apps/api/src/app/workflows-v2/workflow.controller.ts:108` [Confirmed]

- The `ParseSlugEnvironmentIdPipe` is applied to `@UserSession` to verify the environment context belongs to the caller's session.
  Evidence: `apps/api/src/app/workflows-v2/workflow.controller.ts:110` [Confirmed]

- The frontend `ProtectedRoute` component enforces frontend-side permission checks using the same `PermissionsEnum` values from `@novu/shared`.
  Evidence: `apps/dashboard/src/main.tsx:240` [Confirmed]

- The `/widgets` controller does not have `@RequireAuthentication()` at the class level; individual methods carry it instead.
  Evidence: `apps/api/src/app/widgets/widgets.controller.ts:81` (no class-level decorator) [Confirmed]

---

## 4. Core Entities & Data Model

- The `User` entity stores `firstName`, `lastName`, `email`, `password`, `tokens` (OAuth), and `externalId`.
  Evidence: `libs/dal/src/repositories/user/user.schema.ts:8-41` [Confirmed]

- A unique index on `User.email` is only created when `IS_SELF_HOSTED === 'true'`.
  Evidence: `libs/dal/src/repositories/user/user.schema.ts:46` [Confirmed]

- The `Organization` entity stores `name`, `apiServiceLevel`, `stripeCustomerId`, and an embedded `branding` object.
  Evidence: `libs/dal/src/repositories/organization/organization.schema.ts:7-113` [Confirmed]

- The Organization unique index on `name` only applies when `NOVU_ENTERPRISE !== 'true'` AND only for the literal value `'Community Edition'` (via `partialFilterExpression`).
  Evidence: `libs/dal/src/repositories/organization/organization.schema.ts:117-124` [Confirmed]

- The `Environment` entity references its parent Organization via `_organizationId` (ORM ref to `'Organization'`).
  Evidence: `libs/dal/src/repositories/environment/environment.schema.ts:14-17` [Confirmed]

- The `Environment` entity has a self-referential `_parentId` (ORM ref to `'Environment'`) for environment promotion chains.
  Evidence: `libs/dal/src/repositories/environment/environment.schema.ts:59-62` [Confirmed]

- `Environment.identifier` has a unique index enforced both inline and as a separate explicit index.
  Evidence: `libs/dal/src/repositories/environment/environment.schema.ts:10-13` and `:92-97` [Confirmed]

- `Environment.apiKeys` is an embedded array with `key` (unique), `hash`, and `_userId` (ref to `'User'`).
  Evidence: `libs/dal/src/repositories/environment/environment.schema.ts:18-30` [Confirmed]

- `NotificationTemplate` (a Workflow) stores `name`, `steps` (embedded array), `triggers` (embedded array), `tags`, `origin`, `status`, `active`, `draft`.
  Evidence: `libs/dal/src/repositories/notification-template/notification-template.schema.ts:105-276` [Confirmed]

- `NotificationTemplate._environmentId` is an ORM ref to `'Environment'`.
  Evidence: `libs/dal/src/repositories/notification-template/notification-template.schema.ts:223-226` [Confirmed]

- `NotificationTemplate._creatorId` is an ORM ref to `'User'`.
  Evidence: `libs/dal/src/repositories/notification-template/notification-template.schema.ts:231-234` [Confirmed]

- `NotificationTemplate._parentId` is a self-referential ORM ref to `'NotificationTemplate'`, used for environment sync.
  Evidence: `libs/dal/src/repositories/notification-template/notification-template.schema.ts:239-242` [Confirmed]

- Steps inside a workflow are embedded sub-documents (not separate collections) with their own `_templateId` ref to `'MessageTemplate'`.
  Evidence: `libs/dal/src/repositories/notification-template/notification-template.schema.ts:51-54` [Confirmed]

- The `Subscriber` entity stores `subscriberId`, `firstName`, `lastName`, `email`, `phone`, `channels` (mixed array), `isOnline`, and `data` (custom metadata).
  Evidence: `libs/dal/src/repositories/subscriber/subscriber.schema.ts:8-36` [Confirmed]

- `Subscriber` has a unique index on `{ subscriberId, _environmentId }` with `partialFilterExpression: { deleted: false }` to allow re-creation after soft delete.
  Evidence: `libs/dal/src/repositories/subscriber/subscriber.schema.ts:179-182` [Confirmed]

- The `Message` entity (a delivered notification) stores `channel`, `content`, `seen`, `read`, `archived`, `snoozedUntil`, `transactionId`, `status`, and links to `Subscriber`, `NotificationTemplate`, `Job`, `Feed`, and `Notification` via ObjectId refs.
  Evidence: `libs/dal/src/repositories/message/message.schema.ts:7-163` [Confirmed]

---

## 5. Workflow CRUD Flow

- The `WorkflowController` at `apps/api/src/app/workflows-v2/` is prefixed `/workflows` with API version `2`.
  Evidence: `apps/api/src/app/workflows-v2/workflow.controller.ts:80` [Confirmed]

- On `POST /v2/workflows`, the controller delegates to `UpsertWorkflow` (a local adapter) which calls `UpsertWorkflowUseCase` in `libs/application-generic`.
  Evidence: `apps/api/src/app/workflows-v2/workflow.controller.ts:115` [Confirmed]

- `UpsertWorkflowUseCase.execute` first checks for an existing workflow by querying `GetWorkflowByIdsUseCase`; if `command.workflowIdOrInternalId` is absent, `existingWorkflow` is `null`.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:75-84` [Confirmed]

- For new workflows, it calls `mixpanelTrack` with event `'Workflow Created - [API]'`, then `createWorkflowV0Usecase.execute`.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:100-107` [Confirmed]

- After persisting the workflow template, `upsertControlValues` is called as a separate, sequential operation with no enclosing MongoDB session at the usecase level.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:110` [Confirmed]

- A read-after-write fetch is performed via `getWorkflowUseCase.execute` with `skipPreferencesCache: true`.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:112-119` [Confirmed]

- A `WORKFLOW_CREATED` internal webhook event is dispatched after the read-back.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:135-143` [Confirmed]

- The default Notification Group is looked up by `name: 'General'` and `_environmentId`.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:384-388` [Confirmed]

- Step ID generation slugifies the step name and retries up to 5 times to ensure uniqueness within the workflow; after 5 failures, it throws `BadRequestException`.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:343-374` [Confirmed]

---

## 6. Frontend Routing

- The root router is defined in a single file using `createBrowserRouter` with deeply nested route objects.
  Evidence: `apps/dashboard/src/main.tsx:102` [Confirmed]

- `SignUpPage` is routed at `${ROUTES.SIGN_UP}/*` inside an `AuthRoute` wrapper.
  Evidence: `apps/dashboard/src/main.tsx:152-153` [Confirmed]

- `SignInPage` is routed at `${ROUTES.SIGN_IN}/*` inside the same `AuthRoute` wrapper.
  Evidence: `apps/dashboard/src/main.tsx:148-149` [Confirmed]

- `WorkflowsPage` is routed at `ROUTES.WORKFLOWS` guarded by `PermissionsEnum.WORKFLOW_READ`.
  Evidence: `apps/dashboard/src/main.tsx:238-243` [Confirmed]

- `CreateWorkflowPage` is a child route of `ROUTES.WORKFLOWS_CREATE`, rendered inside a `ProtectedRoute` requiring `WORKFLOW_WRITE`.
  Evidence: `apps/dashboard/src/main.tsx:258-263` [Confirmed]

- `CreateWorkflowPage` conditionally renders `CreateWorkflowModal` (AI mode) or `NewWorkflowDrawer` based on the `IS_AI_WORKFLOW_GENERATION_ENABLED` feature flag.
  Evidence: `apps/dashboard/src/pages/create-workflow.tsx:7-12` [Confirmed]

---

## 7. Known Technical Debt (in the Original)

- The `Message` schema has four Mongoose `pre` hooks (`find`, `findOne`, `findOneAndUpdate`, `countDocuments`) that filter soft-deleted documents. A comment explicitly marks them for removal after task `nv-5688`.
  Evidence: `libs/dal/src/repositories/message/message.schema.ts:177-191` [Confirmed]

- A dead index `{ _environmentId, _jobId, deleted }` on `Message` is also marked for removal under the same task.
  Evidence: `libs/dal/src/repositories/message/message.schema.ts:341-344` [Confirmed]

- Two compound indexes on `NotificationTemplate` are marked `// TODO: Deprecate this index. Use the envId, triggerId instead`.
  Evidence: `libs/dal/src/repositories/notification-template/notification-template.schema.ts:339,345` [Confirmed]

- The `Environment` schema has a `post` hook that mutates returned documents in-memory to inject a `type` field for "backward compatibility with environments created before the type field was added".
  Evidence: `libs/dal/src/repositories/environment/environment.schema.ts:108` [Confirmed]

- `prettier.format` errors in email step HTML processing are caught and silently swallowed with only a `logger.warn`; the potentially malformed HTML is still written to the database.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:522-524` [Confirmed]

- Step control values are matched back to existing workflow steps using the client-supplied `_id` field with no server-side cross-workflow ownership check.
  Evidence: `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:639` [Confirmed]
