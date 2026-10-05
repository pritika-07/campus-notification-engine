# PRD.md — Campus Notification Engine
---

## 1. Problem

University students and staff receive critical notices — class cancellations, exam schedule changes, emergency alerts, fee deadlines — through fragmented, unreliable channels (email lists, notice boards, WhatsApp groups). There is no single system that guarantees delivery, lets senders know who read what, or lets recipients choose their preferred channel.

**One-line problem statement**

> For university students and administrators who struggle to reliably reach everyone across multiple channels, the Campus Notification Engine lets admins define multi-channel notification workflows and guarantees delivery tracking, unlike ad-hoc email blasts that have no delivery visibility.

---

## 2. Target Users (from Rebuild Brief)

| Role | Who they are | Core job-to-be-done |
|------|-------------|---------------------|
| **Admin / Sender** | Department registrar, faculty coordinator, IT staff | Define notification workflows, trigger them for cohorts, see delivery status |
| **Student / Recipient** | Enrolled student | Receive notifications on preferred channel; mark as read; manage preferences |
| **Developer / Integrator** | Campus IT developer | Call the API to trigger notifications from existing LMS or ERP systems |

> The primary target users are university administrators/senders who need to distribute critical notifications to large student populations, and students/recipients who need to receive those notifications through their preferred channels without being overwhelmed by notification bursts.

---

## 3. Core Flow (numbered steps)

1. **Admin signs up / signs in** → authenticated via JWT; session scoped to their Organisation and Environment.
2. **Admin connects a channel provider** (email, SMS, push) → creates an Integration record linked to the current Environment.
3. **Admin creates a notification Workflow** → defines one or more Steps (Email, In-App, SMS, Push), sets preferences and trigger identifier.
4. **Admin activates the Workflow** → status changes from `draft` to `active`.
5. **System (or developer via API) triggers the Workflow** → supplies `subscriberId` + payload matching the workflow's trigger schema.
6. **Worker picks up the job** → resolves the Subscriber, selects provider, renders step content using control values, dispatches to the external provider.
7. **External provider delivers the message** → delivery receipt is written as an Execution Detail.
8. **Recipient marks the in-app notification as read** → `Message.seen` and `Message.read` are updated.
9. **Admin views Activity Feed** → sees per-message delivery status across all channels.

---

## 4. Features (MoSCoW)

### Must Have
- Multi-tenant: each Organisation has isolated Environments (Development, Production).
- Workflow builder: create, update, activate, and delete notification workflows with typed steps.
- Subscriber management: create, update, and soft-delete subscribers scoped per Environment.
- At least one delivery channel: In-App (built-in) or Email.
- Trigger API: `POST /v1/events/trigger` with subscriber ID and payload.
- Activity Feed: per-notification delivery status.
- API key authentication per Environment.
- Role-based permissions (`WORKFLOW_READ`, `WORKFLOW_WRITE`, `SUBSCRIBER_READ`, `SUBSCRIBER_WRITE`, `NOTIFICATION_READ`).

### Should Have
- SMS and Push channels.
- Subscriber preference management (opt-out per channel per workflow).
- Topic-based bulk triggers.
- In-App inbox component (real-time via WebSocket).
- Environment sync (promote workflow from Dev → Prod).
- Academic-calendar-aware digest scheduling: digest windows adapt to academic periods such as exam weeks.

### Could Have
- Workflow test/preview before activation.
- Translations / i18n for notification content.
- Email layouts (wrapper templates shared across workflows).
- Analytics dashboard (delivery rate, open rate).

### Won't Have (this sprint)
- AI-generated workflow suggestions.
- Custom domain email sending.
- Billing / subscription tiers.
- Webhook egress from subscriber actions.

---

## 5. Out of Scope

- Modifying or copying the original Novu source code.
- The `apps/webhook`, `apps/ws` (advanced WebSocket relay), and `enterprise/` trees.
- ClickHouse analytics — replace with simple MongoDB aggregation queries for the hackathon.
- Stripe billing integration.

---

## 6. Acceptance Criteria

### AC-1 — Workflow CRUD
**Given** an authenticated admin with `WORKFLOW_WRITE` permission,
**When** they POST a valid workflow definition to `POST /v2/workflows`,
**Then** a `NotificationTemplate` document is created in MongoDB, control values are persisted atomically, and the API responds 201 with the fully populated workflow object.

### AC-2 — Trigger & Delivery
**Given** an active workflow with an Email step and a configured integration,
**When** the trigger API is called with a valid subscriberId and payload,
**Then** a Job is enqueued, the worker dispatches to the email provider, and an Execution Detail record with `status: success` is written within 30 seconds.

### AC-3 — Delivery Atomicity
**Given** a workflow create request whose control-values step fails mid-write,
**When** the failure occurs,
**Then** NO partial `NotificationTemplate` document is left in the database (full rollback), and the API returns a 500 with a machine-readable error code.

### AC-4 — Subscriber Uniqueness
**Given** two concurrent requests to create a subscriber with the same `subscriberId` in the same Environment,
**When** both requests arrive simultaneously,
**Then** exactly one subscriber is created, and the second request receives a 409 Conflict with `{ error: "SUBSCRIBER_ALREADY_EXISTS" }` (never a 500).

### AC-5 — Permission Enforcement
**Given** an authenticated user with only `WORKFLOW_READ` permission,
**When** they attempt to `DELETE /v2/workflows/:id`,
**Then** the API responds 403 Forbidden before any database write occurs.

### AC-6 — Multi-Environment Isolation
**Given** two Environments (Development and Production) in the same Organisation,
**When** a Subscriber is created in Development,
**Then** that Subscriber is NOT visible from the Production environment's API calls.

### AC-7 — Burst Digest (Killer Test)
**Given** ten notification events arrive for the same user within five minutes,
**When** the notification engine processes the events,
**Then** they are grouped into a single digest notification rather than ten separate notifications.

### AC-8 — Channel Preference (Killer Test)
**Given** a user has muted email notifications,
**When** a notification event triggers an email/in-app workflow,
**Then** the user receives the notification through in-app only and does not receive an email.

### AC-9 — Retry Without Duplicate (Killer Test)
**Given** a notification send attempt fails,
**When** the notification engine retries the failed delivery,
**Then** the notification is eventually delivered without creating a duplicate notification.

### AC-10 — Academic Calendar Digest (Differentiator)
**Given** the academic calendar has marked the current week as "Exam Period",
**When** ten non-critical notification events arrive for the same subscriber within one hour,
**Then** the engine holds all ten and delivers a single digest summary at the end of the digest window (not ten individual notifications), AND the digest window length is longer than the default non-exam window.

