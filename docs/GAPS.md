# GAPS.md — Known Gaps in the Original & Our Improvements

> All gaps are tagged [Confirmed] or [Likely] from the Stage 0–8 verification pass.
> We do not include [Guess]-tagged observations.

---

## Part A — What the Original Gets Wrong or Misses

### Gap 1 — Non-Atomic Workflow + Control Values Write
**Type:** Data / Correctness
**Evidence:** `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:102-110` [Confirmed]

`NotificationTemplate` insert and `ControlValues` insert are two sequential `await` calls with no wrapping MongoDB Client Session. If the second call fails, a `NotificationTemplate` document exists in the database with no corresponding control values. The workflow is silently broken — its steps cannot be rendered or previewed. There is no compensating delete or rollback.

**Who it hurts:** Any developer whose network drops between the two writes, or whose MongoDB throws on the second insert (e.g., duplicate key, disk full). The result is invisible corruption: the admin's workflow list shows the workflow as existing, but any trigger attempt fails with a confusing error about missing controls.

---

### Gap 2 — E11000 Duplicate Subscriber Surfaces as HTTP 500
**Type:** Correctness / Error Handling
**Evidence:** `libs/dal/src/repositories/subscriber/subscriber.schema.ts:175` [Confirmed]

The subscriber schema comment explicitly acknowledges: *"We expect an exception to be thrown when attempting to create two subscribers with the same subscriberId."* However, the exception is MongoDB's raw `MongoServerError (E11000)`, which is not caught at the usecase or repository level. NestJS's default exception filter turns this into a 500 Internal Server Error with a Mongo-internal message body, not a 409 Conflict.

**Who it hurts:** Integrators (LMS/ERP developers) who call the subscriber upsert endpoint concurrently during batch imports. They receive 500 errors that look like server crashes, causing retries and further duplicates.

---

### Gap 3 — Four Mongoose `pre` Hooks Block Index Usage on Message Queries
**Type:** Correctness / Performance
**Evidence:** `libs/dal/src/repositories/message/message.schema.ts:177-191` [Confirmed]
Comment text: *"todo: all the pre hooks should be removed after all the soft deletes are removed task nv-5688"*

Every `find`, `findOne`, `findOneAndUpdate`, and `countDocuments` on the `Message` collection injects `{ deleted: { $exists: false } }`. This field is not present in the compound indexes used by the inbox reader, forcing MongoDB to do additional filtering after index traversal. The team's own TODO acknowledges this is technical debt pending a migration.

**Who it hurts:** End-users (students) on high-volume campuses — their notification inbox loads slowly as the `Message` collection grows.

---

### Gap 4 — Step `_id` Matching Trusts Client Input Without Ownership Check
**Type:** Security / Correctness
**Evidence:** `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:639` [Confirmed]

When a `PUT /v2/workflows/:workflowId` request contains step objects with an `_id` field, the server uses `commandStepX._id === updatedStep._templateId` to match incoming steps to persisted steps. The server does not verify that the incoming `_id` belongs to the workflow being updated. A caller who knows a step `_id` from another workflow could supply it here and cause control values from a different workflow to be overwritten.

**Who it hurts:** Multi-tenant setups where one organisation's API key holder can enumerate step IDs via the list endpoints.

---

### Gap 5 — HTML Formatting Errors Silently Swallowed
**Type:** Error Handling / UX
**Evidence:** `libs/application-generic/src/usecases/upsert-workflow/upsert-workflow.usecase.ts:522-524` [Confirmed]

When saving an email step, the system attempts to pretty-print the rendered HTML using `prettier.format`. If Prettier throws a parse error (malformed Maily JSON → invalid HTML), the catch block only calls `this.logger.warn` and continues. The malformed `htmlBody` is then stored as the canonical control value for the step. The admin sees no error; the next send produces broken email.

**Who it hurts:** Admins who compose complex email templates — they receive no feedback that their template's HTML is corrupt.

---

### Gap 6 — Two Deprecated Indexes Still Created on Every Deploy
**Type:** Data / Performance
**Evidence:** `libs/dal/src/repositories/notification-template/notification-template.schema.ts:339,345` [Confirmed]

Two compound indexes on `NotificationTemplate` are explicitly marked `// TODO: Deprecate this index` but are still defined in the schema. On every application startup, Mongoose's `autoIndex` may attempt to reconcile them against MongoDB. They consume write overhead on every workflow CRUD operation.

**Who it hurts:** Database administrators and the engineering team — silent performance tax.

---

### Gap 7 — Environment Backward-Compat Hook Mutates All Read Results
**Type:** Correctness / Performance
**Evidence:** `libs/dal/src/repositories/environment/environment.schema.ts:108` [Confirmed]

A Mongoose `post` hook on `find`, `findOne`, and `findOneAndUpdate` iterates all returned Environment documents and injects a `type` field if it is missing. This in-memory mutation runs on every Environment read, indefinitely, for a condition that should only apply to rows created years before the field was added.

**Who it hurts:** Any code path that bulk-reads environments — the hook adds per-document iteration overhead and makes it impossible to distinguish "document has no type in DB" from "type was injected by the hook".

---

## Part B — Our Two Improvements

### Improvement 1 — Atomic Workflow Writes via MongoDB Client Session

**What we do differently:** We wrap the `NotificationTemplate` insert and all `ControlValues` inserts in a single `session.withTransaction()` block. If any write fails, MongoDB rolls back the entire unit. We open the session at the API handler level and pass it down through the command object to all repository calls.

**Why it matters to our users (campus admins):**
A campus registrar creating a complex 4-step exam notification workflow should never discover hours later that the workflow exists in the list but cannot be triggered because its step templates are missing. Atomic writes eliminate this invisible corruption entirely. The admin either sees the workflow fully created or receives a clean error with no database side-effects. This directly satisfies Acceptance Criterion AC-3 (Killer Test).

---

### Improvement 2 — Structured 409 on Duplicate Subscriber

**What we do differently:** We add a `try/catch` in the subscriber repository's `create` method that inspects the thrown error. If the MongoDB error `code === 11000` (duplicate key on the `unique_subscriber_per_environment` index), we rethrow as NestJS `ConflictException({ error: 'SUBSCRIBER_ALREADY_EXISTS', subscriberId })`. NestJS maps this to a 409 response with a structured, machine-readable body.

**Why it matters to our users (campus IT developers):**
The campus LMS batch-imports student subscribers on enrolment day. Parallel HTTP requests for the same student (e.g., from two concurrent LMS workers) are expected and must not flood the operations team with 500 alerts. A clean 409 tells the integrator "this subscriber already exists — skip and continue", which is actionable without human intervention. This directly satisfies Acceptance Criterion AC-4.

---

### Improvement 3 — Academic Calendar-Aware Digest Scheduling (Differentiator)

**What we do differently:** We introduce an AcademicCalendar entity containing campus academic periods such as regular weeks, exam periods, orientation periods, and holidays. The digest scheduler uses the current academic period to select an appropriate digest window.

**Why it matters to our users (campus students and administrators):**

Notification volume and urgency change throughout the academic calendar. During exam periods, non-critical notifications can be grouped into longer digest windows so students are not interrupted repeatedly, while critical notifications remain subject to the engine's urgent-delivery rules. This makes the notification engine campus-specific rather than a generic notification platform.

**Why this is a Differentiator:** Stage 0–8 verification confirmed that the original DAL contains no academic-calendar/semester/term/exam-period entity, while its timed digest metadata contains only generic scheduling fields. Therefore, the campus academic-calendar scheduling capability is a new feature in our rebuild.
 
**Acceptance Criterion:** AC-10 — Academic Calendar Digest.
