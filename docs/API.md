# API.md — Campus Notification Engine

> Routes are derived from the verified Stage 0–8 findings.
> Field names come directly from verified schema observations.
> Error codes are our own standardized additions (improvement over the original).

---

## Authentication

All routes (except those marked **Public**) require one of:
- `Authorization: Bearer <JWT>` (dashboard users)
- `ApiKey: <api-key>` header (programmatic access)

API keys are stored hashed in `Environment.apiKeys[].hash`. The raw key is never stored.

---

## Conventions

- Base URL: `https://<host>/v2` (V2 API) or `https://<host>/v1` (V1/legacy trigger API)
- All request and response bodies are `application/json`
- All list endpoints support `?limit=50&offset=0&orderBy=createdAt&orderDirection=DESC`
- Standard error envelope: `{ "statusCode": N, "error": "ERROR_CODE", "message": "human readable" }`

---

## Workflows

### `GET /v2/workflows`
List all workflows in the current environment.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `WORKFLOW_READ` |
| **Query params** | `limit`, `offset`, `orderBy`, `orderDirection`, `query` (name search), `tags[]`, `status` |
| **Response 200** | `{ data: WorkflowSummary[], totalCount: number }` |
| **Errors** | 401 UNAUTHORIZED, 403 FORBIDDEN |

---

### `POST /v2/workflows`
Create a new workflow.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `WORKFLOW_WRITE` |
| **Body** | `CreateWorkflowDto` — see fields below |
| **Response 201** | `WorkflowResponseDto` (fully hydrated, including step schemas) |
| **Errors** | 400 STEP_ID_COLLISION (step name uniqueness exhausted), 400 VALIDATION_ERROR, 401, 403 |
| **Atomicity** | `NotificationTemplate` insert + `ControlValues` insert wrapped in MongoDB session |

`CreateWorkflowDto` fields:
- `name` (String, required)
- `description` (String, optional)
- `steps` (Array of `StepDto`, required — may be empty)
- `tags` (Array[String], optional)
- `active` (Boolean, default `false`)
- `preferences` (Object, optional)
- `payloadSchema` (JSON Schema, optional)
- `workflowId` (String, optional — slug; auto-generated from name if absent)

`StepDto` fields:
- `type` (String enum: `email`, `sms`, `push`, `in_app`, `chat`, `delay`, `digest`)
- `name` (String, required)
- `controlValues` (Object, optional — editor values)

---

### `GET /v2/workflows/:workflowId`
Fetch a single workflow by internal ID or trigger identifier.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `WORKFLOW_READ` |
| **Path param** | `workflowId` — accepts internal ObjectId or trigger slug |
| **Response 200** | `WorkflowResponseDto` |
| **Errors** | 401, 403, 404 WORKFLOW_NOT_FOUND |

---

### `PUT /v2/workflows/:workflowId`
Fully replace a workflow's definition.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `WORKFLOW_WRITE` |
| **Body** | `UpdateWorkflowDto` (same shape as `CreateWorkflowDto`) |
| **Response 200** | `WorkflowResponseDto` |
| **Errors** | 400 STEP_NOT_IN_WORKFLOW (step `_id` not owned by this workflow), 400, 401, 403, 404 |

---

### `PATCH /v2/workflows/:workflowId`
Partially update a workflow (e.g., toggle `active`).

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `WORKFLOW_WRITE` |
| **Body** | `PatchWorkflowDto` — any subset of workflow fields |
| **Response 200** | `WorkflowResponseDto` |
| **Errors** | 400, 401, 403, 404 WORKFLOW_NOT_FOUND |

---

### `DELETE /v2/workflows/:workflowId`
Soft-delete a workflow.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `WORKFLOW_WRITE` |
| **Response 204** | No body |
| **Errors** | 401, 403, 404 WORKFLOW_NOT_FOUND |

---

### `PUT /v2/workflows/:workflowId/sync`
Promote a workflow from Development to Production environment.

| | |
|--|--|
| **Auth** | Bearer — `WORKFLOW_WRITE` |
| **Body** | `{ targetEnvironmentId: String }` |
| **Response 200** | `WorkflowResponseDto` (the Production copy) |
| **Errors** | 400 CROSS_ORG_SYNC (target env not in same org), 401, 403, 404 |

---

### `GET /v2/workflows/:workflowId/steps/:stepId`
Retrieve step configuration and schema.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `WORKFLOW_READ` |
| **Response 200** | `StepResponseDto` |
| **Errors** | 401, 403, 404 STEP_NOT_FOUND |

---

### `POST /v2/workflows/:workflowId/step/:stepId/preview`
Generate a rendered preview of a step using sample data.

| | |
|--|--|
| **Auth** | Bearer — `WORKFLOW_READ` |
| **Body** | `GeneratePreviewRequestDto` — `{ controlValues?, previewPayload? }` |
| **Response 201** | `GeneratePreviewResponseDto` — `{ result: { preview, issues } }` |
| **Errors** | 400 PREVIEW_RENDER_FAILED, 401, 403, 404 |

---

## Subscribers

### `GET /v2/subscribers`
List subscribers in the current environment.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `SUBSCRIBER_READ` |
| **Query params** | `limit`, `offset`, `query` (search by email or subscriberId) |
| **Response 200** | `{ data: SubscriberDto[], totalCount: number }` |

---

### `POST /v2/subscribers`
Create or update a subscriber (upsert by `subscriberId`).

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `SUBSCRIBER_WRITE` |
| **Body** | `{ subscriberId, firstName?, lastName?, email?, phone?, data?, locale?, timezone? }` |
| **Response 201** | `SubscriberDto` |
| **Errors** | 409 SUBSCRIBER_ALREADY_EXISTS (concurrent duplicate — never a 500), 400, 401, 403 |

---

### `GET /v2/subscribers/:subscriberId`
Fetch a single subscriber.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `SUBSCRIBER_READ` |
| **Response 200** | `SubscriberDto` |
| **Errors** | 401, 403, 404 SUBSCRIBER_NOT_FOUND |

---

### `PUT /v2/subscribers/:subscriberId`
Update a subscriber's profile fields.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `SUBSCRIBER_WRITE` |
| **Body** | Any subset of profile fields |
| **Response 200** | `SubscriberDto` |
| **Errors** | 401, 403, 404 |

---

### `DELETE /v2/subscribers/:subscriberId`
Soft-delete a subscriber.

| | |
|--|--|
| **Auth** | Bearer / ApiKey — `SUBSCRIBER_WRITE` |
| **Response 204** | No body |
| **Errors** | 401, 403, 404 SUBSCRIBER_NOT_FOUND |

---

## Events (Trigger)

### `POST /v1/events/trigger`
Trigger a notification workflow for one subscriber.

| | |
|--|--|
| **Auth** | ApiKey — `EVENT_WRITE` |
| **Body** | `{ name: workflowIdentifier, to: { subscriberId, email? }, payload: {} }` |
| **Response 201** | `{ acknowledged: true, transactionId: string }` |
| **Errors** | 400 WORKFLOW_NOT_FOUND, 400 SUBSCRIBER_NOT_FOUND, 400 PAYLOAD_VALIDATION_FAILED, 401, 429 RATE_LIMIT_EXCEEDED |

---

### `POST /v1/events/trigger/broadcast`
Trigger a workflow for ALL subscribers in the environment.

| | |
|--|--|
| **Auth** | ApiKey — `EVENT_WRITE` |
| **Body** | `{ name: workflowIdentifier, payload: {} }` |
| **Response 201** | `{ acknowledged: true, transactionId: string }` |
| **Errors** | 400, 401, 429 |

---

## Activity (Execution Log)

### `GET /v1/activity`
List execution history with delivery status per message.

| | |
|--|--|
| **Auth** | Bearer — `NOTIFICATION_READ` |
| **Query params** | `limit`, `page`, `channels[]`, `templates[]`, `search` (transactionId or email) |
| **Response 200** | `{ data: ActivityItemDto[], totalCount: number }` |
| **Errors** | 401, 403 |

---

## Environments

### `GET /v1/environments`
List environments for the current organisation.

| | |
|--|--|
| **Auth** | Bearer (any authenticated member) |
| **Response 200** | `EnvironmentDto[]` |

---

### `GET /v1/environments/api-keys`
Retrieve API keys for the current environment.

| | |
|--|--|
| **Auth** | Bearer — `API_KEY_READ` |
| **Response 200** | `{ apiKeys: [{ key, _userId, hash }] }` — raw key returned only at creation time |

---

## SSE (Real-time)

### `GET /v1/sse`
Server-Sent Events stream for real-time in-app notification delivery.

| | |
|--|--|
| **Auth** | Bearer (subscriber session token) |
| **Response** | `text/event-stream` — emits `notification_received` events |
| **Notes** | Replaces the original's dedicated `apps/ws` WebSocket process |
