# Temporal Runtime — Operational Runbook

This document covers the exact steps to bring up the Autopilot Temporal runtime so CandidateOS → Autopilot runs execute end-to-end.

---

## Architecture

Three processes must be running simultaneously:

| Process | Role | Task queue |
|---|---|---|
| **Temporal Server** | Orchestrator — persists workflow state, dispatches tasks | — |
| **API Server** (`packages/api`) | HTTP API — accepts `POST /api/runs`, creates Temporal workflows | — (client only) |
| **Worker** (`packages/worker`) | Polls `apply-workflow` task queue, executes `applyWorkflow` + activities | `apply-workflow` |

The API is a Temporal **client** (starts/signals/queries workflows).
The Worker is a Temporal **worker** (executes workflow and activity code).
Both connect to the same Temporal Server.

---

## Root causes of `temporalConnected: false`

1. **`start.ts` did not pass `temporal` config** — Fixed in this PR. The production entry point now reads `TEMPORAL_ADDRESS` from env and passes `{ temporal: { address } }` to `startServer()`, which triggers `TemporalClientWrapper.connect()`.

2. **Temporal Server unreachable** — `TEMPORAL_ADDRESS` must point to a running Temporal gRPC endpoint (port 7233). If the server is down or the address is wrong, the API starts without a Temporal client (logs a warning).

3. **No Worker process** — Even with `temporalConnected: true`, workflows will be accepted but never execute unless a Worker is polling the `apply-workflow` task queue. This was the "runs accepted but never actually execute" symptom.

---

## Required environment variables

### API Server

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TEMPORAL_ADDRESS` | **Yes** (for live runs) | `localhost:7233` | Temporal gRPC endpoint |
| `TEMPORAL_NAMESPACE` | No | `default` | Temporal namespace |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | No | `4000` | HTTP listen port |
| `AUTOPILOT_API_KEY` | Recommended | — | Shared secret for CandidateOS calls |
| `AUTOPILOT_CORS_ORIGIN` | Recommended | `*` | Allowed CORS origins |

### Worker

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TEMPORAL_ADDRESS` | **Yes** | `localhost:7233` | Temporal gRPC endpoint |
| `TEMPORAL_NAMESPACE` | No | `default` | Temporal namespace |
| `ANTHROPIC_API_KEY` | Yes (for LLM activities) | — | Claude API key |
| `BRIGHT_DATA_AUTH` | Yes (for browser activities) | — | Bright Data proxy credentials |
| `DATABASE_URL` | Depends on activities | — | If activities read/write DB |

### Temporal Server (docker-compose)

| Variable | Default | Purpose |
|---|---|---|
| `DB` | `postgresql` | Storage backend |
| `POSTGRES_USER` | `dejsol` | DB user |
| `POSTGRES_PWD` | `dejsol` | DB password |
| `POSTGRES_SEEDS` | `postgres` | DB host |

---

## Local startup (development)

### Step 1: Start infrastructure

```bash
# From repo root
docker compose up -d
# Starts: postgres, redis, temporal, temporal-ui
```

Or use the full dev script:

```bash
npm run dev
# Waits for all services, runs migrations
```

### Step 2: Build all packages

```bash
npm run build
```

### Step 3: Start the API server

```bash
export TEMPORAL_ADDRESS=localhost:7233
export DATABASE_URL=postgresql://dejsol:dejsol@localhost:5432/dejsol?schema=public
node packages/api/dist/start.js
```

### Step 4: Start the Worker

In a separate terminal:

```bash
export TEMPORAL_ADDRESS=localhost:7233
export ANTHROPIC_API_KEY=sk-ant-...
export BRIGHT_DATA_AUTH=...
node packages/worker/dist/start.js
```

---

## Deploy startup (Railway / Docker)

### API (existing Dockerfile)

Set these env vars in Railway:
- `TEMPORAL_ADDRESS` — your Temporal Cloud or self-hosted address
- `TEMPORAL_NAMESPACE` — your namespace
- `DATABASE_URL` — your PostgreSQL connection string
- `AUTOPILOT_API_KEY` — shared secret
- `AUTOPILOT_CORS_ORIGIN` — CandidateOS domain(s)

### Worker (Dockerfile.worker)

Deploy as a separate Railway service using `Dockerfile.worker`:

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile.worker"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

Set env vars:
- `TEMPORAL_ADDRESS` — same as API
- `TEMPORAL_NAMESPACE` — same as API
- `ANTHROPIC_API_KEY`
- `BRIGHT_DATA_AUTH`

### Temporal Server

Options:
1. **Temporal Cloud** (recommended for production) — no self-hosting needed
2. **Self-hosted** via `temporalio/auto-setup` Docker image (see docker-compose.yml)

---

## Health-check commands

### 1. API health (confirms Temporal client is connected)

```bash
curl -s https://<autopilot-host>/health | jq .
```

Expected:
```json
{
  "status": "ok",
  "service": "dejsol-api",
  "temporalConnected": true,
  "timestamp": "2026-04-16T..."
}
```

`temporalConnected: true` means the API successfully opened a gRPC connection to Temporal.

### 2. Temporal Server health

```bash
# If using docker-compose locally:
docker compose exec temporal tctl cluster health
# Expected output: SERVING

# If using Temporal Cloud or remote:
tctl --address <temporal-address> cluster health
```

### 3. Worker is polling (check Temporal UI)

Open Temporal UI (`http://localhost:8080` locally, or your Temporal Cloud UI).

Navigate to: **Namespaces → default → Task Queues → apply-workflow**

You should see at least one worker (poller) listed. If the task queue shows 0 pollers, the worker is not running or not connected.

### 4. End-to-end run test

```bash
# Create a run via the API
curl -s -X POST https://<autopilot-host>/api/runs \
  -H "Content-Type: application/json" \
  -H "x-api-key: <your-key>" \
  -d '{
    "jobId": "test-job-1",
    "candidateId": "<valid-candidate-uuid>",
    "mode": "FULL_AUTO",
    "jobUrl": "https://job-boards.greenhouse.io/company/jobs/12345",
    "atsType": "GREENHOUSE"
  }' | jq .
```

Note the `id` from the response, then poll status:

```bash
curl -s https://<autopilot-host>/api/runs/<run-id>/status \
  -H "x-api-key: <your-key>" | jq .
```

You should see `phase` progress from `"initializing"` → `"running"` → `"completed"` and `percentComplete` increase.

---

## Confirmation criteria: "ready for one live run"

All five must be true:

| # | Check | How to verify |
|---|---|---|
| 1 | Temporal Server is `SERVING` | `tctl cluster health` returns `SERVING` |
| 2 | API reports `temporalConnected: true` | `GET /health` → `temporalConnected: true` |
| 3 | Worker is polling `apply-workflow` | Temporal UI shows ≥1 poller on `apply-workflow` task queue |
| 4 | `POST /api/runs` returns `"Run started and workflow triggered"` | Response `message` field |
| 5 | Workflow appears in Temporal UI | Namespaces → default → Workflows → `apply-<runId>` is visible and `Running` |

If all five pass, CandidateOS → Autopilot end-to-end execution is operational.
