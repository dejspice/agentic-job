# Temporal Runtime — Railway Deployment Runbook

---

## 1. Recommended Railway Architecture

Four Railway services in one project:

| # | Service name | Type | Image / Dockerfile | Exposes port |
|---|---|---|---|---|
| 1 | **Postgres** | Railway managed plugin | `PostgreSQL` plugin | 5432 (private) |
| 2 | **Temporal** | Docker service | `temporalio/auto-setup:latest` | 7233 (private) |
| 3 | **API** | Docker service | `Dockerfile` (repo root) | $PORT (public) |
| 4 | **Worker** | Docker service | `Dockerfile.worker` (repo root) | $PORT (private, health only) |

- API and Worker are **two separate Railway services** from the same repo.
- Both connect to Temporal over **Railway private networking** (plain gRPC, no TLS).
- Temporal self-hosted on Railway is the fastest path — avoids Temporal Cloud mTLS setup.
- Redis is **not required** for the minimum viable topology.

---

## 2. Temporal Hosting Recommendation

**Self-hosted Temporal on Railway** using `temporalio/auto-setup:latest`.

Why:
- Zero signup, zero mTLS certificate management.
- Railway private networking gives sub-ms latency between API/Worker ↔ Temporal.
- The `auto-setup` image auto-creates the `default` namespace and runs schema migrations.
- Temporal Cloud requires mTLS certs (adds setup complexity with no benefit for initial launch).
- You can migrate to Temporal Cloud later if operational overhead becomes a concern.

---

## 3. Required Railway Services — Exact Setup

### Service 1: Postgres (Railway Plugin)

In your Railway project, click **+ New** → **Database** → **PostgreSQL**.

Railway auto-provisions it and exposes `DATABASE_URL` as a shared variable.

No further config needed. The API reads `DATABASE_URL` for Prisma.

### Service 2: Temporal

Click **+ New** → **Empty Service** → **Settings**:

| Setting | Value |
|---|---|
| Source | Docker Image |
| Image | `temporalio/auto-setup:latest` |
| Port | `7233` |
| Networking | Private only (no public domain) |

**Environment variables:**

```
DB=postgres12
DB_PORT=5432
POSTGRES_USER=<from Railway Postgres>
POSTGRES_PWD=<from Railway Postgres>
POSTGRES_SEEDS=<Railway Postgres private hostname>
```

Use Railway's variable references to pull these from the Postgres plugin:
```
DB=postgres12
POSTGRES_USER=${{Postgres.PGUSER}}
POSTGRES_PWD=${{Postgres.PGPASSWORD}}
POSTGRES_SEEDS=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
```

> **Note:** The documented `DB` value for PostgreSQL is `postgres12` (not `postgresql`).
> The `auto-setup` image is deprecated upstream in favor of `temporalio/server` +
> `temporalio/admin-tools`, but still works and is the fastest path for initial setup.

**Private networking hostname:** Once deployed, note the internal hostname,
e.g. `temporal.railway.internal`. This is the `TEMPORAL_ADDRESS` for API and Worker.

### Service 3: API

Click **+ New** → **GitHub Repo** → select this repo.

| Setting | Value |
|---|---|
| Builder | Dockerfile |
| Dockerfile path | `Dockerfile` |
| Watch paths | `packages/api/**`, `packages/core/**`, `prisma/**`, `Dockerfile` |
| Health check path | `/health` |
| Health check timeout | 30s |
| Restart policy | On failure (3 retries) |
| Networking | **Public domain** (generate one or set custom) |

**Environment variables:**

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
TEMPORAL_ADDRESS=temporal.railway.internal:7233
TEMPORAL_NAMESPACE=default
AUTOPILOT_API_KEY=<your shared secret>
AUTOPILOT_CORS_ORIGIN=https://app.candidateos.com
PORT=4000
NODE_ENV=production
```

> Replace `temporal.railway.internal` with the actual private hostname
> Railway assigns to your Temporal service.

### Service 4: Worker

Click **+ New** → **GitHub Repo** → select this repo (same repo as API).

| Setting | Value |
|---|---|
| Builder | Dockerfile |
| Dockerfile path | `Dockerfile.worker` |
| Watch paths | `packages/worker/**`, `packages/workflows/**`, `packages/core/**`, `Dockerfile.worker` |
| Health check path | `/health` |
| Health check timeout | 120s |
| Restart policy | On failure (5 retries) |
| Networking | Private only (no public domain needed) |

**Environment variables:**

```
TEMPORAL_ADDRESS=temporal.railway.internal:7233
TEMPORAL_NAMESPACE=default
ANTHROPIC_API_KEY=<your Claude API key>
BRIGHT_DATA_AUTH=<your Bright Data credentials>
NODE_ENV=production
```

> The worker does NOT need `DATABASE_URL` — activities don't write to Postgres directly.
> The worker DOES need `ANTHROPIC_API_KEY` (for LLM-powered screening) and
> `BRIGHT_DATA_AUTH` (for proxy-backed browser sessions).

---

## 4. Exact Env Vars Per Service

### Temporal

| Variable | Value |
|---|---|
| `DB` | `postgres12` |
| `DB_PORT` | `${{Postgres.PGPORT}}` |
| `POSTGRES_USER` | `${{Postgres.PGUSER}}` |
| `POSTGRES_PWD` | `${{Postgres.PGPASSWORD}}` |
| `POSTGRES_SEEDS` | `${{Postgres.PGHOST}}` |

### API

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `TEMPORAL_ADDRESS` | `temporal.railway.internal:7233` |
| `TEMPORAL_NAMESPACE` | `default` |
| `AUTOPILOT_API_KEY` | `<your-shared-secret>` |
| `AUTOPILOT_CORS_ORIGIN` | `https://app.candidateos.com` |
| `PORT` | `4000` |
| `NODE_ENV` | `production` |

### Worker

| Variable | Value |
|---|---|
| `TEMPORAL_ADDRESS` | `temporal.railway.internal:7233` |
| `TEMPORAL_NAMESPACE` | `default` |
| `ANTHROPIC_API_KEY` | `<your-claude-key>` |
| `BRIGHT_DATA_AUTH` | `<your-brightdata-auth>` |
| `NODE_ENV` | `production` |

---

## 5. Deploy Order — Exact Runbook

### Step 1: Postgres

1. Add PostgreSQL plugin to your Railway project.
2. Note: Railway auto-provisions and exposes connection variables.

### Step 2: Temporal

1. Create the Temporal service (Docker image: `temporalio/auto-setup:latest`).
2. Set env vars referencing Postgres (see above).
3. Deploy. Wait for it to become healthy (may take 60–90s on first boot for schema setup).
4. Note the private hostname (visible in service settings → Networking).

### Step 3: API

1. Create the API service from the GitHub repo.
2. Set Dockerfile path to `Dockerfile`.
3. Set all API env vars (replacing `temporal.railway.internal` with actual hostname).
4. Deploy. Wait for health check to pass at `/health`.
5. Open the public URL and verify:
   ```
   curl https://<api-public-url>/health
   ```
   Expected: `{"status":"ok","temporalConnected":true,...}`

### Step 4: Worker

1. Create the Worker service from the same GitHub repo.
2. Set Dockerfile path to `Dockerfile.worker`.
3. Set all Worker env vars.
4. Deploy. Wait for health check to pass at `/health`.
5. Verify via worker health endpoint (use Railway's internal URL or deploy logs):
   ```
   {"status":"ok","service":"dejsol-worker","taskQueue":"apply-workflow","polling":true,...}
   ```

### Step 5: Validate End-to-End

```bash
# 1. API health — temporalConnected must be true
curl -s https://<api-public-url>/health | jq .temporalConnected
# Expected: true

# 2. Worker health — polling must be true
# (Check deploy logs or Railway's health check dashboard)
# Expected: [worker] Polling task queue "apply-workflow"...

# 3. Fire a test run from CandidateOS or curl
curl -s -X POST https://<api-public-url>/api/runs \
  -H "Content-Type: application/json" \
  -H "x-api-key: <your-key>" \
  -d '{
    "jobId": "test-job-1",
    "candidateId": "<valid-candidate-uuid>",
    "mode": "FULL_AUTO",
    "jobUrl": "https://job-boards.greenhouse.io/company/jobs/12345",
    "atsType": "GREENHOUSE"
  }'
# Expected: 201, message: "Run started and workflow triggered"

# 4. Poll run status
curl -s https://<api-public-url>/api/runs/<run-id>/status \
  -H "x-api-key: <your-key>" | jq .
# Expected: phase progresses from "initializing" → "running" → "completed"
```

---

## 6. Confirmation Criteria: "CandidateOS Can Now Run One Real Live Application"

All five must be true simultaneously:

| # | Check | How to verify | Expected |
|---|---|---|---|
| 1 | Temporal server running | Railway Temporal service is "Active" | Green status |
| 2 | API reports Temporal connected | `GET /health` | `temporalConnected: true` |
| 3 | Worker is polling | Worker deploy logs or health endpoint | `polling: true` |
| 4 | Run creates + triggers workflow | `POST /api/runs` | `message: "Run started and workflow triggered"` |
| 5 | Workflow progresses | `GET /api/runs/:id/status` | `phase` changes from `initializing` |

If all five pass, CandidateOS can trigger real live Autopilot runs end-to-end.

---

## 7. What Does NOT Need to Be on Railway

- **Redis** — Not used by API or Worker in the current execution path.
- **Temporal UI** — Nice to have for debugging, not required for execution. Add later as an optional 5th service (`temporalio/ui:latest` with `TEMPORAL_ADDRESS` pointing to the Temporal private hostname).
- **Console** — The Vite React app (`packages/console`) is an operator dashboard. Deploy separately if desired (Vercel recommended for static hosting).
