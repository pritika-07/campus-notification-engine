# HACKBACK code review · DBG-987 · Campus Notification Engine
- Reviewed at: 2026-10-06T08:40:44Z (2026-10-06T14:10:44+05:30 IST)
- Judged commit: e3f8c12cb9bcc4dd9283b24394eda265d209c343 (2026-10-06T13:34:15+05:30) · the last commit before the code freeze
- Reviewer: AI agent run by a HACKBACK judge

### DBG-987 · Campus Notification Engine
Commit: e3f8c12cb9bcc4dd9283b24394eda265d209c343 · 2026-10-06T13:34:15+05:30 · Clean-room: see flags

| Section | Score | Why (path:line) |
|---|---|---|
| A. Core flow | 30/30 | Full end-to-end flow from event trigger (`apps/api/src/modules/events/events.controller.ts:20-28`, `apps/api/src/modules/events/trigger.service.ts:43-182`), BullMQ worker dispatch (`apps/api/src/modules/events/notification-dispatch.worker.ts:52-204`), channel preference check (`apps/api/src/modules/events/notification-dispatch.worker.ts:72-82`), burst digest aggregation (`apps/api/src/modules/digest/digest.service.ts:67-216`), retry deduplication (`apps/api/src/modules/messages/message.repository.ts:22-50`), and real-time in-app inbox + SSE feed (`apps/api/src/modules/activity/activity.controller.ts:58-177`, `apps/dashboard/src/pages/InboxPage.tsx:1-284`). |
| B. Killer Tests | 18/30 | Server logic is fully implemented and correctly structured for all 3 killer tests (burst digests via Redis hash + delayed BullMQ flush, server-side channel preference mute check, and idempotency key deduplication on worker retries). However, no automated unit/integration tests are present in the repo (`npm test` reports 0 tests found), resulting in 6/10 for each test per rubric. |
| C. Two improvements | 20/20 | 1) Atomic workflow writes via MongoDB client session transaction (`apps/api/src/modules/workflows-v2/usecases/upsert-workflow.usecase.ts:38-204`). 2) Structured 409 Conflict on duplicate subscriber (`apps/api/src/modules/subscribers/subscriber.repository.ts:16-22`) and Academic-calendar-aware digest scheduling (`apps/api/src/modules/digest/digest-window.service.ts:16-39`, `apps/api/src/modules/integrations/integrations.controller.ts:151-202`). Both fully built and wired in. |
| D. Built from their docs | 9/10 | Closely implements PRD acceptance criteria (`docs/PRD.md:83-134`), data model entities and compound indexes (`docs/DATA_MODEL.md:9-346`), and API endpoints (`docs/API.md:28-283`). Minor omission of broadcast endpoint (`POST /v1/events/trigger/broadcast`) and step preview endpoint (`POST /v2/workflows/:id/step/:stepId/preview`). |
| E. Engineering | 9/10 | Strong engineering practices: NestJS DTO validation (`apps/api/src/main.ts:97-103`), permission guards on all routes (`apps/api/src/common/guards/permissions.guard.ts:15-74`), asynchronous BullMQ queue dispatch for 30,000 students (`apps/api/src/modules/events/trigger.service.ts:153-166`), clean error filter, and no secrets committed. Deducted 1 point for lack of automated test suite. |
| Total | 86/100 | |

Killer Tests:
1. PARTIAL · 6/10 · Events grouped in Redis hash key by subscriber/workflow/step/digestKey and flushed via BullMQ delayed job (`apps/api/src/modules/digest/digest.service.ts:67-114`, `apps/api/src/modules/digest/digest.service.ts:138-216`) using window config (`apps/api/src/modules/digest/digest-window.service.ts:28-39`). Correct logic on server, but no automated test in repo.
2. PARTIAL · 6/10 · Subscriber channel preferences stored in DB (`apps/api/src/modules/subscribers/subscriber.schema.ts:61-71`) and enforced server-side before dispatch (`apps/api/src/modules/events/notification-dispatch.worker.ts:72-82`); muted channel is logged as skipped in execution detail while in-app message delivers independently. Correct logic on server, but no automated test in repo.
3. PARTIAL · 6/10 · BullMQ queue configured with 5 attempts and exponential backoff (`apps/api/src/modules/events/trigger.service.ts:157-161`). Delivery idempotency guaranteed by unique compound index on `{ transactionId, _subscriberId, _environmentId, channel }` (`apps/api/src/modules/messages/message.schema.ts:109-112`) and graceful duplicate handling in `insertIfNotExists` (`apps/api/src/modules/messages/message.repository.ts:22-50`). Correct logic on server, but no automated test in repo.

Improvements:
1. Atomic workflow + control values writes · 10/10 · Implemented using MongoDB `session.withTransaction()` wrapping `NotificationTemplate` upsert and `ControlValues` bulk operations (`apps/api/src/modules/workflows-v2/usecases/upsert-workflow.usecase.ts:38-204`).
2. Academic-calendar-aware digest scheduling & Structured 409 subscriber conflict · 10/10 · Academic calendar schema, repository, and controller (`apps/api/src/modules/integrations/academic-calendar.schema.ts:8-30`, `apps/api/src/modules/integrations/integrations.controller.ts:151-202`) dynamically adjust digest windows for exam periods in `DigestWindowService` (`apps/api/src/modules/digest/digest-window.service.ts:16-39`); Mongo E11000 duplicate subscriber error mapped to structured HTTP 409 Conflict (`apps/api/src/modules/subscribers/subscriber.repository.ts:16-22`).

Flags:
- Push after code freeze: Commit `e3f8c12cb9bcc4dd9283b24394eda265d209c343` was committed at `2026-10-06T13:34:15+05:30` (4 minutes 15 seconds after the 13:30 IST freeze deadline).

3 questions for the judges to ask this team in their Defence, aimed at the weakest spots you found:
1. "How does the notification engine handle high-volume broadcast triggers to 30,000 students when `POST /v1/events/trigger/broadcast` is not present in the controller?"
2. "Why were there no automated unit or integration tests configured or executed in the repository test suite?"
3. "In `ApiKeyAuthGuard` (`apps/api/src/modules/auth/guards/api-key-auth.guard.ts:31-51`), every incoming request triggers a full collection scan across all environments with `bcrypt.compare` in a nested loop. How would you optimize API key authentication to scale under campus load?"

SCORE core=30 kt=18 imp=20 docs=9 eng=9 total=86
