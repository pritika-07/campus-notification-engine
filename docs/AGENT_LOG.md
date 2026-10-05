# AGENT_LOG.md — Conversation History & Self-Corrections

> This log records the key prompts, what the agent found, and every correction made
> during Stages 0–8 of the reverse-engineering process.
> Intended audience: a future AI agent that needs to understand how these docs were produced.

---

## Stage 0 — Ground Rules

**Prompt summary:** Do not modify, create, delete, or copy any files in the original repository. Do not implement anything. For Stages 0–8, only inspect and analyse existing source code. For every factual claim, provide exact file:line evidence. Clearly distinguish Confirmed, Likely, and Guess.

**Key rule established:** The session is strictly read-only on the original repo. "Guess" claims are never used in downstream documentation.

---

## Stage 1 — Tech Stack & How to Run

**Prompt summary:** Tech stack, run commands, environment variables, folder map, odd files.

**Key findings:**
- NX monorepo: `apps/`, `libs/`, `packages/`, `enterprise/`
- Backend: NestJS + TypeScript
- Frontend: React + Vite SPA
- DB: MongoDB (Mongoose ODM), Redis (BullMQ queues), ClickHouse (analytics)
- Auth: Clerk (cloud) or JWT (self-hosted)
- Evidence: `package.json`, `apps/api/package.json`, `apps/dashboard/package.json`

**Odd files noted:** `_templates/` (code generation scaffolding), `apps/webhook` (inactive per AGENTS.md).

---

## Stage 2 — Product Explanation (First-Year Student Level)

**Prompt summary:** Explain what this product does, who for, why they'd use it. Every user role. 3–5 main features. README claims not found in code.

**Key findings:**
- The product is a notification infrastructure platform: developers define multi-channel notification workflows via API; end-users receive them.
- Two primary roles found: Developer/Workspace Admin (creates workflows, manages integrations, reads activity) and Subscriber/End-User (receives notifications, manages inbox).
- Main features traced to code: Workflow CRUD, Provider Integrations, Subscriber Management, Activity Feed, In-App Inbox.

---

## Stage 3 — Architecture Diagram

**Prompt summary:** Mermaid flowchart of every component; table of boxes with proof; where state lives.

**Key findings:**
- API → MongoDB (primary state), Redis (queues), S3 (storage)
- Worker → dequeues from Redis → calls external providers → writes ExecutionDetails to MongoDB
- WebSocket app (`apps/ws`) bridges Redis pub/sub to browser
- State: MongoDB (primary), Redis (ephemeral jobs), browser localStorage (session token), S3 (uploaded assets)

---

## Stage 4 — Entry Points (API Routes + Frontend Screens)

**Prompt summary:** Table 1: every API route. Table 2: every frontend screen. Count routes and handlers.

**Key findings:**
- 50 controller files; ~465 handler methods (estimated from `@(Get|Post|Put|Delete|Patch)` grep)
- 74 frontend route definitions in `apps/dashboard/src/main.tsx`
- `grep` shell command failed (Windows PowerShell; no `grep`). Fell back to `grep_search` tool.

**Correction noted at time:** Could not confirm exact handler count via shell on Windows. Count of 465 is [Likely], not [Confirmed]. Documented in Stage 8 verification.

---

## Stage 5 — Data Model

**Prompt summary:** Mermaid erDiagram; how each relationship is stored; entity table; unused fields.

**Key findings:**
- 43 repository directories under `libs/dal/src/repositories/`
- All entity-to-entity relationships use Mongoose `ref` (ORM reference via ObjectId), not embedded documents (except steps within a workflow and apiKeys within an environment, which are embedded arrays)
- Deprecated indexes flagged with inline `// TODO:` comments

**Corrections:**
- Initial claim that Organization name is "globally unique" was imprecise. Corrected in Stage 8: the uniqueness only applies to the literal string `'Community Edition'` via `partialFilterExpression`.

---

## Stage 6 — End-to-End Feature Trace ("User Creates a Workflow")

**Prompt summary:** Sequence diagram + numbered steps; every check; every failure mode.

**Key findings:**
- `CreateWorkflowPage` branches between `CreateWorkflowModal` (AI mode) and `NewWorkflowDrawer` based on feature flag `IS_AI_WORKFLOW_GENERATION_ENABLED`
- Backend flow: Controller → `UpsertWorkflow` adapter → `UpsertWorkflowUseCase` (in `libs/application-generic`) → `createWorkflowV0Usecase` + `upsertControlValues` (sequential, no transaction)
- Checks: `@RequireAuthentication`, `@RequirePermissions(WORKFLOW_WRITE)`, `ParseSlugEnvironmentIdPipe`, step ID uniqueness loop
- Critical failure mode confirmed: if `upsertControlValues` fails, the `NotificationTemplate` document remains orphaned

---

## Stage 7 — Code Review (8+ Gaps)

**Prompt summary:** Review like a senior code reviewer; list gaps: security / correctness / data / UX / docs drift; highest severity first.

**Key findings (top 3):**
1. No MongoDB transaction wrapping Workflow + ControlValues writes (High)
2. `Message` soft-delete hooks blocking index usage, pending `nv-5688` removal (High)
3. Client-supplied step `_id` trusted without cross-workflow ownership check (Medium)

---

## Stage 8 — Verification Pass

**Prompt summary:** Re-read every cited file:line. Tag Confirmed / Likely / Guess. List all corrections.

**Corrections made:**

| Original claim | Correction | Reason |
|---------------|-----------|--------|
| Organization name is "uniquely constrained" | Unique only for value `'Community Edition'` | `partialFilterExpression: { name: 'Community Edition' }` at `organization.schema.ts:122` |
| `SignUpPage` cited at `main.tsx:152` | Correct line is `152` (path) + `153` (element) | Off-by-one; both lines together prove the claim |
| "No global Transaction Interceptor wrapping the controller" | Downgraded to [Likely] | Did not read the full NestJS module config; the absence of a session at the usecase level is confirmed but the module-level config was not exhaustively checked |
| Route handler count "465" stated as fact | Downgraded to [Likely] | `grep` shell command failed on Windows; count came from a previous session summary |

**No claims were fully dropped.** All cited file:line references that were re-read were confirmed to contain the stated content.

---

## Stage 9 — Documentation Generation (This Stage)

**Prompt summary:** Using only Confirmed and Likely findings, write docs/ for the campus-notification-engine clean-room rebuild. No code copying. Mark unknowns.

**Files produced:**
- `docs/OBSERVATIONS.md` — all verified claims grouped by topic
- `docs/PRD.md` — problem, users, core flow, MoSCoW, acceptance criteria
- `docs/ARCHITECTURE.md` — component map, Mermaid diagram, 6 key decisions
- `docs/DATA_MODEL.md` — full entity reference, erDiagram, indexes
- `docs/API.md` — all routes, inputs, outputs, permissions, errors
- `docs/GAPS.md` — 7 confirmed gaps, 2 improvements with user-impact rationale
- `docs/AGENT_LOG.md` — this file

**Items marked Unknown (not invented):**
- Encryption method for `Integration.credentials` (not confirmed in schema files read)
- Exact handler count (465 is Likely, not Confirmed)
- Exact content of the hackathon Rebuild Brief and Killer Tests (placeholder left for user)
