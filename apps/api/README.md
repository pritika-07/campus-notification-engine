# @campus/api — NestJS Backend

## Setup

### 1. Start dependencies

```bash
# From repository root
docker-compose up -d
```

Starts MongoDB and Redis containers (see `../../docker-compose.yml`).

### 2. Install dependencies

```bash
# From repository root
npm install
```

Workspace root already manages `apps/*` and `packages/*`.

### 3. Environment

Create `apps/api/.env` or set env vars in your shell:

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/campus-notifications
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=dev-secret-change-me
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### 4. Build @campus/shared first

```bash
# From repository root
npm run build --workspace=@campus/shared
```

### 5. Run the API

```bash
# From repository root
npm run dev:api
```

Or directly:

```bash
cd apps/api
npm run start:dev
```

The API is available on http://localhost:3000 with:

- `/v1/auth/signup`, `/v1/auth/signin` — JWT auth (on signup: auto-creates Org, Dev+Prod envs, ADMIN member, Dev API key)
- `/v1/events/trigger` — ApiKey header `ApiKey: <key>` with EVENT_WRITE scope
- `/v1/activity`, `/v1/inbox`, `/v1/sse`, `/v1/messages/:id/seen|read|archive`
- `/v1/integrations` + `/v1/academic-calendar`
- `/v2/workflows` + `/v2/workflows/:id/sync` (atomic writes via `session.withTransaction()`)
- `/v2/subscribers` (Mongo 11000 → 409 Conflict)
