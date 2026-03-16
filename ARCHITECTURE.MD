# DEJSOL APPLY OS — Architecture & System Prompt

You are building **Dejsol Apply OS**, a state-machine-first agentic job application platform.

This document is the **single source of truth** for:
- what the system is
- what technologies are locked
- how packages are divided
- what build order to follow
- how agents should make implementation decisions

Your job is to build within this architecture, not invent a different one.

---

# Operating mode for Cursor

Follow these rules on every task:

1. **Stay scoped.**
   - Start with the smallest relevant package or file set.
   - Do **not** scan the whole repo unless the task truly requires it.
   - Prefer targeted file inspection over broad exploration.

2. **Plan before editing.**
   - For non-trivial tasks, first identify:
     - the likely package(s)
     - the minimal file set
     - the exact change path
   - Then implement.

3. **Deterministic before agentic.**
   - Always prefer deterministic logic over LLM logic.
   - Only use LLM-powered paths when deterministic patterns do not exist.

4. **Respect package boundaries.**
   - Do not move responsibilities across packages without strong architectural reason.
   - Implement changes in the package that owns that domain.

5. **Do not substitute the stack.**
   - The technologies in this doc are locked unless explicitly changed by the user.

6. **Do not over-abstract early.**
   - Build concrete implementations first.
   - Extract abstractions only after repeated patterns clearly emerge.

7. **Minimize token waste.**
   - Avoid rereading unrelated files.
   - Avoid rewriting architecture in the response.
   - Avoid speculative refactors.
   - Keep code changes narrow and production-oriented.

8. **When a task is ambiguous, output this first:**
   - files to inspect
   - files to edit
   - implementation plan
   - risks / unknowns

9. **When implementing, keep output compact:**
   - what changed
   - why
   - follow-up risks
   - suggested tests

10. **Never treat the LLM as the browser driver.**
    - This system is a policy-governed state machine invoking deterministic browser automation.
    - The LLM is only used at decision points and fallbacks.

---

# What you are building

Dejsol Apply OS is a **state-machine-first agentic job application platform**. It completes job applications across ATS platforms such as:

- Greenhouse
- Lever
- Workday
- iCIMS
- Ashby
- SmartRecruiters
- Taleo
- SAP SuccessFactors
- custom career portals

It uses:
- deterministic automation for known flows
- LLM reasoning only at decision points
- structured human escalation for low-confidence or edge-case scenarios

## Core principle

**Deterministic where possible, agentic where necessary.**

This system is **not** "an LLM driving a browser."

It is a **policy-governed state machine** that:
- invokes browser automation through Playwright
- executes against Bright Data Agent Browser infrastructure
- pulls candidate assets from Google Drive
- updates tracking sheets in real time
- escalates to humans when confidence is low

---

# Locked tech stack

Do not substitute these technologies unless explicitly instructed.

| Layer | Technology | Notes |
|-------|------------|-------|
| Language | TypeScript (Node.js) | All backend services |
| Browser Control | Playwright | Remote sessions via WebSocket/CDP |
| Browser Runtime (primary) | Bright Data Agent Browser | Anti-bot, CAPTCHA, proxy, auto-scaling |
| Browser Runtime (fallback) | Browserbase / Kernel / Steel | Provider rotation |
| Workflow Orchestration | Temporal | Durable workflows, signals, human gates |
| Primary Database | PostgreSQL | Jobs, runs, audit logs, profiles, accelerator packs |
| Cache / Coordination | Redis | Locks, rate limiting, coordination |
| Vector Store | pgvector | Semantic retrieval over answers and notes |
| Artifact Storage | S3 / GCS | Screenshots, traces, DOM snapshots, HAR files |
| Document Storage | Google Drive API + Sheets API | Resumes, cover letters, tracking sheet |
| LLM | Claude API (`claude-sonnet-4-20250514`) | Planning, Q&A, semantic mapping, recovery |
| Frontend | React + TypeScript | Operator console, review queue, replay viewer |
| Data Acquisition | Chrome Extension (Manifest V3) | Capture extension for manual apply sessions |

---

# Architecture principle

This platform must be built as:

**policy engine → state machine → browser worker → artifacts / review / persistence**

Not:

**LLM → browser directly**

The LLM is the cold-start engine.  
Stored data, accelerator packs, pattern matchers, and fingerprints become the steady-state engine.

---

# Module responsibility map

Use this table to route work to the correct package quickly.

| Package | Responsibility |
|--------|----------------|
| `packages/core` | Shared types, enums, constants, state names |
| `packages/drive-connector` | Google Drive and Sheets integration |
| `packages/job-intake` | Job normalization, ATS detection, scoring, dedupe |
| `packages/strategy-engine` | Apply strategy, mode selection, policy decisions |
| `packages/state-machine` | State orchestration and transition policies |
| `packages/browser-broker` | Browser session allocation across providers |
| `packages/browser-worker` | Deterministic Playwright command execution |
| `packages/accelerators` | ATS-specific classifier/schema/path packs |
| `packages/intelligence` | LLM-backed reasoning and fallback intelligence |
| `packages/workflows` | Temporal workflows and activities |
| `packages/api` | REST API endpoints |
| `packages/console` | React operator console |
| `extensions/capture` | Manual-session Chrome capture extension |
| `scripts` | Seed scripts, session processing, accelerator generation |

---

# Project structure

```text
dejsol/
├── ARCHITECTURE.md
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── prisma/
│   └── schema.prisma
├── packages/
│   ├── core/
│   ├── drive-connector/
│   ├── job-intake/
│   ├── strategy-engine/
│   ├── state-machine/
│   ├── browser-broker/
│   ├── browser-worker/
│   ├── accelerators/
│   ├── intelligence/
│   ├── workflows/
│   ├── api/
│   └── console/
├── extensions/
│   └── capture/
└── scripts/
```

---

# Canonical package responsibilities

## `packages/core`

Contains shared:

* types
* enums
* constants
* state definitions

Expected examples:

* `candidate.ts`
* `job.ts`
* `run.ts`
* `accelerator.ts`
* `portal-fingerprint.ts`
* `ats-type.ts`
* `run-status.ts`
* `run-mode.ts`
* `state-name.ts`
* `states.ts`

## `packages/drive-connector`

Handles:

* Google OAuth
* resume retrieval from Drive
* tracking sheet read/write
* DB ↔ Sheet sync support

## `packages/job-intake`

Handles:

* raw listing normalization
* ATS detection
* idempotency and dedupe
* fit/applyability/confidence scoring

## `packages/strategy-engine`

Handles:

* should-apply logic
* run-mode selection
* asset selection
* policy evaluation

## `packages/state-machine`

Owns the finite-state application flow:

* state modules
* state transition logic
* retry / timeout / escalation policy
* validation watcher

## `packages/browser-broker`

Owns session allocation and runtime abstraction:

* Bright Data primary connector
* fallback provider connectors
* unified session handle

## `packages/browser-worker`

Owns deterministic browser execution:

* command protocol
* Playwright execution
* artifact capture
* grounding signals
* timing model

## `packages/accelerators`

Owns ATS-specific knowledge packs:

* page classifiers
* form schemas
* path templates
* edge cases

Also owns the universal fallback engine for unknown flows.

## `packages/intelligence`

Owns LLM-backed reasoning only where deterministic logic does not exist:

* planner
* answer generator
* field classifier
* fit analyzer
* error recovery
* pattern matcher

## `packages/workflows`

Owns Temporal workflows, activities, signals, and queries.

## `packages/api`

Owns REST surface for:

* ingest
* apply
* status
* review
* drive sync
* accelerator operations

## `packages/console`

Owns operator-facing UI:

* dashboard
* review queue
* run detail
* policy config
* replay / artifact visibility

## `extensions/capture`

Owns Chrome extension capture for manual apply sessions.

---

# Canonical database schema

Implement these tables exactly.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum AtsType {
  WORKDAY
  GREENHOUSE
  LEVER
  ASHBY
  ICIMS
  SMARTRECRUITERS
  TALEO
  SAP
  CUSTOM
}

enum JobStatus {
  QUEUED
  IN_PROGRESS
  REVIEW
  SUBMITTED
  FAILED
  SKIPPED
}

enum RunMode {
  FULL_AUTO
  REVIEW_BEFORE_SUBMIT
  HUMAN_TAKEOVER
}

enum RunOutcome {
  SUBMITTED
  FAILED
  ESCALATED
  CANCELLED
}

model Candidate {
  id               String   @id @default(uuid())
  name             String
  email            String
  phone            String?
  driveFolderId    String?  @map("drive_folder_id")
  trackingSheetId  String?  @map("tracking_sheet_id")
  profileJson      Json     @map("profile_json")
  answerBankJson   Json     @default("{}") @map("answer_bank_json")
  denylist         String[] @default([])
  policiesJson     Json     @default("{}") @map("policies_json")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  jobs             JobOpportunity[]
  runs             ApplyRun[]

  @@map("candidates")
}

model JobOpportunity {
  id                String    @id @default(uuid())
  candidateId       String    @map("candidate_id")
  company           String
  jobTitle          String    @map("job_title")
  jobUrl            String    @map("job_url")
  atsType           AtsType   @map("ats_type")
  location          String?
  compensationJson  Json?     @map("compensation_json")
  requirementsJson  Json?     @map("requirements_json")
  fitScore          Float?    @map("fit_score")
  applyabilityScore Float?    @map("applyability_score")
  confidenceScore   Float?    @map("confidence_score")
  status            JobStatus @default(QUEUED)
  idempotencyKey    String    @unique @map("idempotency_key")
  createdAt         DateTime  @default(now()) @map("created_at")
  candidate         Candidate @relation(fields: [candidateId], references: [id])
  runs              ApplyRun[]

  @@map("job_opportunities")
}

model ApplyRun {
  id                 String      @id @default(uuid())
  jobId              String      @map("job_id")
  candidateId        String      @map("candidate_id")
  mode               RunMode
  runtimeProvider    String?     @map("runtime_provider")
  resumeFile         String?     @map("resume_file")
  currentState       String?     @map("current_state")
  stateHistoryJson   Json        @default("[]") @map("state_history_json")
  answersJson        Json        @default("{}") @map("answers_json")
  errorLogJson       Json        @default("[]") @map("error_log_json")
  artifactUrlsJson   Json        @default("{}") @map("artifact_urls_json")
  confirmationId     String?     @map("confirmation_id")
  outcome            RunOutcome?
  humanInterventions Int         @default(0) @map("human_interventions")
  costJson           Json        @default("{}") @map("cost_json")
  startedAt          DateTime    @default(now()) @map("started_at")
  completedAt        DateTime?   @map("completed_at")
  job                JobOpportunity @relation(fields: [jobId], references: [id])
  candidate          Candidate      @relation(fields: [candidateId], references: [id])

  @@map("apply_runs")
}

model AtsAccelerator {
  id                  String   @id @default(uuid())
  atsType             AtsType  @unique @map("ats_type")
  version             Int      @default(1)
  pageClassifiersJson Json     @map("page_classifiers_json")
  formSchemaJson      Json     @map("form_schema_json")
  pathTemplatesJson   Json     @map("path_templates_json")
  edgeCasesJson       Json     @default("{}") @map("edge_cases_json")
  successRate         Float?   @map("success_rate")
  lastValidated       DateTime? @map("last_validated")

  @@map("ats_accelerators")
}

model PortalFingerprint {
  id                 String    @id @default(uuid())
  employerDomain     String    @map("employer_domain")
  atsType            AtsType   @map("ats_type")
  knownFlowJson      Json      @default("{}") @map("known_flow_json")
  fieldMappingsJson  Json      @default("{}") @map("field_mappings_json")
  avgSteps           Int?      @map("avg_steps")
  avgDuration        Int?      @map("avg_duration")
  lastSuccess        DateTime? @map("last_success")
  lastFailure        DateTime? @map("last_failure")
  challengeFrequency Float?    @map("challenge_frequency")
  notes              String?

  @@unique([employerDomain, atsType])
  @@map("portal_fingerprints")
}
```

---

# State machine

The apply workflow is a finite state machine with 14 states.
Each state must have:

* explicit entry criteria
* success criteria
* retry policy
* timeout policy
* escalation policy

Implement each state as its own module under:

`packages/state-machine/src/states/`

## Canonical states

```typescript
export enum StateName {
  INIT = 'INIT',
  OPEN_JOB_PAGE = 'OPEN_JOB_PAGE',
  DETECT_APPLY_ENTRY = 'DETECT_APPLY_ENTRY',
  LOGIN_OR_CONTINUE = 'LOGIN_OR_CONTINUE',
  UPLOAD_RESUME = 'UPLOAD_RESUME',
  WAIT_FOR_PARSE = 'WAIT_FOR_PARSE',
  VALIDATE_PARSED_PROFILE = 'VALIDATE_PARSED_PROFILE',
  FILL_REQUIRED_FIELDS = 'FILL_REQUIRED_FIELDS',
  ANSWER_SCREENING_QUESTIONS = 'ANSWER_SCREENING_QUESTIONS',
  REVIEW_DISCLOSURES = 'REVIEW_DISCLOSURES',
  PRE_SUBMIT_CHECK = 'PRE_SUBMIT_CHECK',
  SUBMIT = 'SUBMIT',
  CAPTURE_CONFIRMATION = 'CAPTURE_CONFIRMATION',
  ESCALATE = 'ESCALATE',
}
```

## Policy shape

```typescript
export interface StatePolicy {
  maxRetries: number;
  timeoutSeconds: number;
  retryBackoff: 'LINEAR' | 'EXPONENTIAL';
  onFailure: 'RETRY' | 'SKIP_STATE' | 'ESCALATE';
  onTimeout: 'RETRY' | 'ESCALATE';
  requiresScreenshot: boolean;
  requiresDomSnapshot: boolean;
  confidenceThreshold: number;
  humanReviewTrigger?: string;
}
```

## State policy rules

* `SUBMIT` and `PRE_SUBMIT_CHECK` always require screenshots.
* `FILL_REQUIRED_FIELDS` and `ANSWER_SCREENING_QUESTIONS` require DOM snapshots.
* `ESCALATE` is terminal and has `maxRetries: 0`.
* Every state must be explicitly configured in `packages/state-machine/src/policies.ts`.

---

# Browser worker command protocol

The browser worker executes a narrow, deterministic command set.
It does **not** reason independently.

```typescript
export type WorkerCommand =
  | { type: 'NAVIGATE'; url: string }
  | { type: 'CLICK'; target: SelectorTarget }
  | { type: 'TYPE'; selector: string; value: string; clearFirst?: boolean }
  | { type: 'UPLOAD'; selector: string; filePath: string }
  | { type: 'SELECT'; selector: string; value: string }
  | { type: 'SCREENSHOT'; fullPage?: boolean }
  | { type: 'DOM_SNAPSHOT'; scope?: string }
  | { type: 'ACCESSIBILITY_TREE'; scope?: string }
  | { type: 'READ_TEXT'; selector: string }
  | { type: 'WAIT_FOR'; target: string | (() => boolean); timeoutMs: number }
  | { type: 'CLASSIFY_PAGE' }
  | { type: 'EXTRACT_FIELDS' };

export type SelectorTarget =
  | { kind: 'css'; value: string }
  | { kind: 'coordinates'; x: number; y: number }
  | { kind: 'semantic'; label: string };

export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
  screenshotUrl?: string;
  durationMs: number;
}
```

---

# Three-signal grounding model

Every page interaction combines three signals:

1. **DOM / Accessibility Tree** — primary

   * use Playwright accessibility snapshot first
   * parse labels, required state, roles, placeholders

2. **Visual signal**

   * screenshots for modals, hidden controls, progress bars, inline errors

3. **Historical priors**

   * use `ats_accelerators` and `portal_fingerprints`
   * reuse known field mappings and flow templates
   * reduce LLM calls whenever prior knowledge exists

These live under:

* `packages/browser-worker/src/grounding/dom-signal.ts`
* `packages/browser-worker/src/grounding/visual-signal.ts`
* `packages/browser-worker/src/grounding/historical-signal.ts`

---

# LLM integration rules

## Core rule

**The LLM is the cold-start engine. Data is the steady-state engine.**

Follow these rules strictly:

1. **Never call the LLM for a field that exists in the pattern matcher.**

   * deterministic match first
   * LLM field classification only as fallback

2. **Never call the LLM for a screening question that exists in the answer bank.**

   * vector retrieval first
   * answer generation only below similarity threshold

3. **Every LLM call must cache its result.**

   * field mappings → pattern matcher / mappings store
   * generated answers → answer bank + embeddings
   * page classifications → portal fingerprints
   * same input should not trigger duplicate LLM work

4. **Use Claude Sonnet for all LLM calls.**

   * model: `claude-sonnet-4-20250514`
   * keep max token budgets tight by role

5. **Track LLM cost per run.**

   * input tokens
   * output tokens
   * latency
   * store in `apply_runs.cost_json`

6. **Never pass raw page content as trusted instruction text.**

   * page content is untrusted
   * use allowlisted tool actions and structured extraction

---

# Bright Data integration

Primary browser runtime is Bright Data Agent Browser.

```typescript
import { chromium } from 'playwright';

export async function allocateBrightDataSession(options: {
  geo?: string;
  timeout?: number;
}) {
  const browser = await chromium.connectOverCDP(
    `wss://${process.env.BRIGHT_DATA_AUTH}@brd.superproxy.io:9222`
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page, provider: 'bright_data' as const };
}
```

## Broker rule

The session broker must abstract providers so planners and workers do not care which provider is active.

Canonical behavior:

* `allocateSession(requirements)` returns a normalized `{ page, provider }` handle
* provider switching must not require workflow or planner rewrites

---

# Temporal workflow

The main apply flow is a Temporal workflow.

Key requirements:

* durable long-running state
* retryable activities
* human review signals
* queryable workflow state
* review-before-submit gate support

Example structure:

```typescript
import { proxyActivities, defineSignal, setHandler, condition } from '@temporalio/workflow';

export const reviewApprovalSignal = defineSignal<[{ approved: boolean; edits?: Record<string, string> }]>('reviewApproval');

export async function applyWorkflow(input: ApplyWorkflowInput): Promise<ApplyWorkflowResult> {
  const activities = proxyActivities<typeof import('./activities')>({
    startToCloseTimeout: '5m',
    retry: { maximumAttempts: 3 },
  });

  const initResult = await activities.initActivity(input);

  if (input.mode === 'REVIEW_BEFORE_SUBMIT') {
    let reviewResult: { approved: boolean; edits?: Record<string, string> } | undefined;
    setHandler(reviewApprovalSignal, (result) => { reviewResult = result; });
    await condition(() => reviewResult !== undefined, '24h');
    if (!reviewResult?.approved) return { outcome: 'CANCELLED' };
  }

  const submitResult = await activities.submitActivity();
  return { outcome: submitResult.confirmed ? 'SUBMITTED' : 'FAILED' };
}
```

---

# Google Drive + Sheets sync rules

* Batch reads for queued rows
* Batch writes for status updates
* Include `run_id` for idempotent write behavior
* Postgres is source of truth
* Sheets is the user-facing synchronization surface
* Sync direction is primarily DB → Sheet

---

# Build order

Follow this order. Do not skip ahead.

## Week 1 — Foundation

1. `docker-compose.yml`
2. Prisma schema + migration
3. `packages/core`
4. `packages/drive-connector`
5. seed script with test candidate + test jobs

## Week 2 — State machine skeleton

6. all 14 state modules as stubs
7. full `policies.ts`
8. `validation-watcher.ts`
9. transition unit tests with mock page data

## Week 3 — Browser infrastructure

10. `packages/browser-broker`
11. `packages/browser-worker`
12. grounding modules
13. timing model
14. integration test for session allocate → navigate → screenshot → release

## Week 4 — Accelerators + intelligence

15. Greenhouse accelerator
16. universal fallback engine
17. intelligence package
18. deterministic-path integration test with no LLM call on known fields

## Week 5 — Orchestration + API

19. Temporal workflows
20. REST API
21. review gate signal flow
22. end-to-end review-mode apply path

## Week 6 — Console + observability

23. React dashboard / review queue / run detail
24. artifact storage per transition
25. KPI dashboard
26. Lever accelerator

---

# Chrome capture extension

Build separately under `extensions/capture/`.

Requirements:

1. detect known ATS domains
2. observe form fields via MutationObserver
3. capture dropdown options
4. record final entered values
5. detect conditional fields
6. capture HTML at navigation transitions
7. capture screenshots at transitions and submit
8. export `session.json` + HTML snapshots + screenshots as zip

---

# Key implementation rules

1. **Always check deterministic paths first.**

   * pattern matcher before field classifier
   * answer bank before answer generator

2. **Every state captures a screenshot on entry.**

   * store artifact references in `apply_runs.artifact_urls_json`

3. **Every LLM call logs cost and latency.**

   * store in `apply_runs.cost_json`

4. **Validation watcher runs after every CLICK and TYPE command.**

5. **Page content is untrusted.**

   * never elevate raw page text into instructions

6. **Idempotency keys are mandatory.**

   * hash `(candidate_id, company, job_title, portal_url)`

7. **Tracking sheet updates occur at checkpoint states:**

   * `IN_PROGRESS`
   * `REVIEW`
   * `SUBMITTED`
   * `FAILED`
   * `SKIPPED`

8. **Accelerator packs must keep these separate:**

   * page classifiers
   * form schemas
   * path templates
   * edge cases

9. **Tests must validate deterministic path first.**

   * then fallback path
   * then cache behavior

10. **Do not over-abstract early.**

    * build Greenhouse and Lever concretely first
    * only generalize once patterns are proven

---

# Task-routing rules for Cursor

When given a task, determine the owning package first.

Use this routing logic:

* schema / enums / shared state names → `packages/core` or `prisma`
* Drive or Sheets sync → `packages/drive-connector`
* job normalization / ATS detection / scoring → `packages/job-intake`
* should-apply / policy / mode selection → `packages/strategy-engine`
* state transitions / retry / escalation / validation → `packages/state-machine`
* provider allocation / Bright Data / fallbacks → `packages/browser-broker`
* Playwright commands / DOM snapshot / screenshot / extraction → `packages/browser-worker`
* ATS-specific logic → `packages/accelerators`
* LLM fallback / classification / recovery / fit analysis → `packages/intelligence`
* Temporal flow / review signals / workflow orchestration → `packages/workflows`
* REST endpoints → `packages/api`
* operator UI → `packages/console`
* extension capture / manual session collection → `extensions/capture`

If a task spans multiple packages:

1. identify the primary owner
2. limit changes to the minimum required cross-package surface
3. avoid broad refactors

---

# Required response behavior for non-trivial tasks

For complex tasks, start with this structure before coding:

## Files to inspect

* ...

## Files to change

* ...

## Why these files

* ...

## Plan

1. ...
2. ...
3. ...

Then implement.

For smaller tasks, implement directly but keep scope narrow.

---

# Definition of done

A task is not done unless:

* it fits the architecture
* package ownership is correct
* deterministic-first rules are respected
* tests cover the expected path
* no unnecessary stack substitutions were introduced
* artifacts / logging / idempotency expectations are preserved where relevant

---

# Final instruction

Build **Dejsol Apply OS** as a durable, production-oriented, state-machine-first automation system.

Do not drift into:

* broad speculative abstraction
* LLM-first design
* repo-wide rewrites
* tool substitution
* browser-driving-by-prompt

Stay concrete, scoped, deterministic-first, and architecture-aligned.
