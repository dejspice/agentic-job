# Local Demo Guide — Greenhouse + Google Sheets Pipeline

Run the full Google Sheets → Greenhouse apply pipeline locally on Mac.

---

## 1. Checkout

```bash
git fetch origin
git checkout main
git pull origin main

# Verify you're on the tagged release
git log --oneline -1
# Expected: 2f33a18 merge: Google Sheets pipeline + combobox option mapping + candidate profile loader
```

---

## 2. Prerequisites

| Requirement | Version | Check |
|------------|---------|-------|
| Node.js | 22.x | `node --version` |
| npm | 10.x+ | `npm --version` |
| Google Chrome | Any recent | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version` |
| Playwright Chromium | Auto-installed | `npx playwright install chromium` |

**Chrome path on Mac:**
Playwright bundles its own Chromium, so Chrome is optional. If you need system Chrome (e.g. for extensions), set:
```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

---

## 3. Environment Setup

### Required env vars

Create a `.env.local` file or export these in your shell:

```bash
# ── Google credentials (pick ONE method) ───────────────────────────

# Option A: Path to service-account JSON key file (recommended)
export GOOGLE_CREDENTIALS_PATH="/path/to/your-service-account.json"

# Option B: Raw JSON string (used in CI / cloud agents)
export GOOGLE_CREDENTIALS_JSON='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'

# Option C: Standard Google SDK env var (same as Option A)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account.json"

# ── Anthropic (enables LLM fallback for freeform screening questions) ─
export ANTHROPIC_API_KEY="sk-ant-..."

# ── Optional: Bright Data (for proxied browser sessions) ──────────
# export BRIGHT_DATA_AUTH="brd-customer-XXXX-zone-scraping_browser1:PASSWORD"
```

**Google service account requirements:**
- Sheets API enabled
- Drive API enabled
- Service account has Viewer access to the tracking spreadsheet
- Service account has Viewer access to the resume Google Docs

### Candidate profile

The candidate is loaded from `packages/workflows/src/demo/candidate.json` automatically. No env vars needed. Edit this file to change the candidate:

```json
{
  "firstName": "Siam",
  "lastName": "Hashan",
  "email": "hashansiam4@gmail.com",
  "phone": "4699938785",
  "city": "Dallas",
  "state": "TX",
  "country": "United States"
}
```

Required fields: `firstName`, `lastName`, `email`, `phone`, `city`, `state`, `country`.

---

## 4. Install + Build

```bash
# From repo root
npm install

# Install Playwright browsers (one-time)
npx playwright install chromium

# Build all packages
npm run build
```

Verify the build:
```bash
npx tsc --build
# Should exit 0 with no output
```

---

## 5. Run Demo (Google Mode)

```bash
cd packages/workflows

# Full pipeline — reads all pending rows from the Google Sheet
npm run demo:google
```

This runs with the baked-in sheet ID (`1-uOsL9Z6F22lrHaPk30vU-7HmXh2Y9nP6iCNXlovb08`).

### With custom sheet ID or row limit:

```bash
cd packages/workflows

DEMO_SOURCE=google \
GOOGLE_SHEET_ID="your-sheet-id" \
DEMO_LIMIT=2 \
node --require tsx/cjs src/demo/run-demo.ts
```

### Env var reference:

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `DEMO_SOURCE` | No | `local` | Set to `google` for Google Sheets mode |
| `GOOGLE_SHEET_ID` | Yes (google mode) | baked in `demo:google` | Spreadsheet ID |
| `GOOGLE_SHEET_NAME` | No | `Job Tracking` | Sheet tab name |
| `DEMO_LIMIT` | No | `0` (unlimited) | Max rows to process |
| `ANTHROPIC_API_KEY` | No | — | Enables LLM for freeform textareas |
| `BROWSER_PROVIDER` | No | `local` | `local` or `bright_data` |

---

## 6. Run Targeted Rerun (Specific Rows)

```bash
cd packages/workflows

# Rerun Wavelo (row 97) and SmithRx (row 101)
node --require tsx/cjs src/demo/rerun-wavelo-smithrx.ts

# Rerun only SmithRx
RERUN_COMPANIES=SmithRx RERUN_ROWS=101 \
node --require tsx/cjs src/demo/rerun-wavelo-smithrx.ts

# Rerun via Bright Data instead of local Chrome
BROWSER_PROVIDER=bright_data RERUN_COMPANIES=SmithRx RERUN_ROWS=101 \
node --require tsx/cjs src/demo/rerun-wavelo-smithrx.ts
```

---

## 7. Expected Output

### Terminal output for a successful run:

```
[DEMO] Candidate: Siam Hashan (hashansiam4@gmail.com)
[DEMO] Phone: 4699938785 | City: Dallas | State: TX
[DEMO] Reading pending rows from Google Sheet (tab: Job Tracking)…
[DEMO] Found 2 pending row(s).
[DEMO] ─────────────────────────────────────────────
[DEMO]  Greenhouse Apply — Batch Demo
[DEMO]  Mode: google
[DEMO] ─────────────────────────────────────────────
[DEMO]  Loading 2 job application(s)…
[DEMO] ─────────────────────────────────────────────
[DEMO]  ✓ [1/2] Siam Hashan — SUBMITTED (verify) (137.1s)
[DEMO]  ✓ [2/2] Siam Hashan — SUBMITTED (verify) (106.7s)
[DEMO] ─────────────────────────────────────────────
[DEMO]  Total jobs:    2
[DEMO]  Submitted:     0
[DEMO]  Submitted (verify): 2  ← form submitted, awaiting email code
[DEMO]  Failed:        0
[DEMO]  Success rate:  100%
[DEMO] ─────────────────────────────────────────────
[DEMO]  Results saved: artifacts-batch/run-results.json
[DEMO] ─────────────────────────────────────────────
```

### What "SUBMITTED (verify)" means:

The application form was filled completely, passed pre-submit validation, and the Submit button was clicked. Greenhouse responded with an email verification challenge (bot detection). The application **is submitted** — entering the security code from the candidate's email inbox finalizes it.

### Artifacts created:

```
packages/workflows/artifacts-batch/
├── run-results.json              # Batch summary
├── resumes/                      # Exported PDFs from Google Drive
│   └── Siam-Hashan-resume-rowNN.pdf
└── <run-id>/
    ├── screenshot/               # Screenshots at state transitions
    └── dom_snapshot/             # DOM snapshots for debugging
```

### Google Sheet writeback:

After each row runs, the sheet is updated:
- **Column E** (Status): `Applied`, `Verification Required`, `Failed`, or `Skipped`
- **Column F** (Application Date): ISO timestamp
- **Columns J–M**: run_id, outcome, error, completed_at

---

## 8. Troubleshooting

### Playwright browser not found

```
Error: browserType.launch: Executable doesn't exist at ...
```

Fix:
```bash
npx playwright install chromium
```

### Google auth failure

```
Error: No Google credentials found. Set GOOGLE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS.
```

Fix: set one of the three credential env vars from step 3. For a key file:
```bash
export GOOGLE_CREDENTIALS_PATH="$HOME/.config/gcloud/service-account.json"
```

### Drive export permission denied

```
Error: Resume export failed: The caller does not have permission
```

Fix: share the Google Doc (resume) with the service account's `client_email` address (visible in the JSON key file). The service account needs at least Viewer access.

### Missing ANTHROPIC_API_KEY

The pipeline runs without it — deterministic screening rules handle most fields. But freeform textareas (e.g. "Describe your automation experience") will be skipped. To enable LLM:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Chrome path on Mac (if not using Playwright's bundled Chromium)

```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

### candidate.json not found

```
Error: Cannot read candidate profile from .../src/demo/candidate.json
```

The command must be run from `packages/workflows/` (not the repo root). The loader resolves `candidate.json` relative to `process.cwd()`:
```bash
cd packages/workflows
npm run demo:google
```

### Sheet shows "Not Applied" but rows are skipped

The pipeline only processes rows with Greenhouse URLs (`boards.greenhouse.io` or `greenhouse.io`). Non-Greenhouse ATS URLs are skipped with `Unsupported ATS`.
