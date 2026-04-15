# Autopilot Integration Guide

This document defines the external integration surface for CandidateOS.

Autopilot is the execution engine and operator UI for automated job applications. CandidateOS is the parent product that owns candidate profiles and orchestrates user-facing workflows.

---

## Authentication

All `/api/*` routes are gated by a shared API key when `AUTOPILOT_API_KEY` is set.

```
x-api-key: <value of AUTOPILOT_API_KEY>
```

When `AUTOPILOT_API_KEY` is not set (dev/test), all requests are allowed.

### Environment variables

| Variable | Purpose |
|---|---|
| `AUTOPILOT_API_KEY` | Shared secret for CandidateOS → Autopilot API calls |
| `AUTOPILOT_CORS_ORIGIN` | Allowed CORS origin(s), comma-separated (e.g. `https://app.candidateos.com,http://localhost:3000`) |

---

## CORS

Set `AUTOPILOT_CORS_ORIGIN` to the CandidateOS domain(s). Defaults to `*` when not set.

---

## API Endpoints

Base URL: `https://<autopilot-host>/api`

### Candidate management

CandidateOS creates/syncs candidate profiles into Autopilot before launching runs.

#### Create candidate

```
POST /api/candidates
Content-Type: application/json
x-api-key: <key>

{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "555-1234",
  "city": "Dallas",
  "state": "TX",
  "country": "United States"
}
```

**Response** (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "555-1234",
    "profileJson": { "firstName": "Jane", ... },
    "answerBankJson": {},
    "createdAt": "2026-04-11T...",
    "updatedAt": "2026-04-11T..."
  }
}
```

#### Update candidate

```
PATCH /api/candidates/:id
```

Body: any subset of `{ name, email, phone, profileJson }`.

#### Get candidate

```
GET /api/candidates/:id
```

Returns profile + `_count: { runs, jobs }`.

---

### Run lifecycle

#### Launch a run

```
POST /api/runs
Content-Type: application/json
x-api-key: <key>

{
  "jobId": "string",
  "candidateId": "uuid",
  "mode": "FULL_AUTO",
  "jobUrl": "https://job-boards.greenhouse.io/company/jobs/12345",
  "atsType": "GREENHOUSE"
}
```

**Response** (201):
```json
{
  "success": true,
  "data": {
    "id": "run-uuid",
    "jobId": "string",
    "candidateId": "uuid",
    "mode": "FULL_AUTO",
    "outcome": null,
    "currentState": null,
    "actionRequired": false,
    "startedAt": "2026-04-11T...",
    "completedAt": null
  }
}
```

#### List runs for a candidate

```
GET /api/runs?candidateId=<uuid>&pageSize=20&page=1
```

Optional filters: `outcome` (SUBMITTED, VERIFICATION_REQUIRED, FAILED, SKIPPED).

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "run-uuid",
      "candidateId": "uuid",
      "outcome": "SUBMITTED",
      "currentState": "CAPTURE_CONFIRMATION",
      "actionRequired": false,
      "startedAt": "...",
      "completedAt": "...",
      "candidate": { "name": "Jane Doe", "email": "jane@example.com" },
      "job": { "company": "Acme", "jobTitle": "Engineer", "jobUrl": "..." }
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
}
```

#### Get run detail

```
GET /api/runs/:id
```

Same shape as list item, plus full `stateHistoryJson`, `answersJson`, `artifactUrlsJson`, `errorLogJson`, `costJson`.

#### Get live run status

```
GET /api/runs/:id/status
```

Returns `currentState`, `phase`, `statesCompleted`, `percentComplete`. Requires Temporal for live data.

---

### Action-required flows

#### Submit verification code

When `outcome === "VERIFICATION_REQUIRED"` and `actionRequired === true`:

```
POST /api/runs/:id/verification-code
Content-Type: application/json

{ "code": "x3hqj2zh" }
```

#### Review screening answers

```
GET /api/runs/:id/screening-answers
```

Returns `answersJson` with per-question entries including `question`, `answer`, `source`, `confidence`, `adjudication`.

#### Approve answers to answer bank

```
POST /api/runs/:id/screening-answers/approve
Content-Type: application/json

{
  "answers": [
    { "question": "Do you require sponsorship?", "answer": "No" },
    { "question": "How did you hear?", "answer": "Job board" }
  ]
}
```

Merges approved answers into the candidate's answer bank for future runs.

---

## Run outcome model

| Outcome | Meaning | `actionRequired` |
|---|---|---|
| `null` | In progress | `false` |
| `SUBMITTED` | Application fully submitted | `false` |
| `VERIFICATION_REQUIRED` | Submitted, awaiting email verification code | **`true`** |
| `SKIPPED` | Job posting expired/removed (not actionable) | `false` |
| `FAILED` | Engine could not complete the application | `false` |
| `ESCALATED` | Routed to human review | **`true`** |
| `CANCELLED` | Manually cancelled | `false` |

`actionRequired` is computed server-side and included in all run list/detail responses.

---

## UI deep links

Autopilot's operator console is a standalone React app. CandidateOS links into it for detailed views.

| Action | URL |
|---|---|
| View all runs for a candidate | `/runs?candidateId=<uuid>` |
| View run detail / screening review | `/runs/<runId>` |
| Dashboard (KPIs) | `/` |
| Review queue | `/review` |

The console reads from the same API. No additional configuration needed for deep links.

---

## Data ownership

| Data | Owner | Sync direction |
|---|---|---|
| Candidate profile | CandidateOS | CandidateOS → Autopilot (`POST/PATCH /api/candidates`) |
| Job listings | CandidateOS | Created inline during `POST /api/runs` |
| Run execution + state | Autopilot | Autopilot → CandidateOS (`GET /api/runs`) |
| Screening answers | Autopilot | Read via API |
| Answer bank | Autopilot | Written via approve endpoint |
| Artifacts (screenshots, DOM) | Autopilot | Not exposed via API (operator console only) |

### Do not duplicate

- Run outcomes — always read from Autopilot API
- Answer bank — always managed via Autopilot approve endpoint
- Candidate profile — CandidateOS is source of truth, synced to Autopilot

---

## Quick start

```bash
# Set environment
export AUTOPILOT_API_KEY="your-shared-secret"
export AUTOPILOT_CORS_ORIGIN="https://app.candidateos.com"

# Start Autopilot API
cd packages/api && npm start

# Start Autopilot console
cd packages/console && npm run dev
```

CandidateOS integration:
1. Create candidate: `POST /api/candidates`
2. Launch run: `POST /api/runs` with `candidateId` + `jobUrl`
3. Poll status: `GET /api/runs/:id/status`
4. Handle verification: `POST /api/runs/:id/verification-code`
5. Review answers: `GET /api/runs/:id/screening-answers`
6. Approve answers: `POST /api/runs/:id/screening-answers/approve`
7. Deep link to console: `/runs/:runId`
