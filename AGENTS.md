# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

Dejsol Apply OS is a TypeScript npm-workspace monorepo with 12 packages under `packages/`. See `ARCHITECTURE.MD` for the full system-design doc and module responsibility map.

### Infrastructure services (Docker Compose)

PostgreSQL (pgvector:pg16), Redis 7, Temporal, and Temporal UI are defined in `docker-compose.yml`. Start them with:

```
docker compose up -d
```

**Gotcha:** The original `docker-compose.yml` shipped with `DB=postgresql` for the Temporal container, which is invalid. It must be `DB=postgres12` (already fixed in the repo).

Wait for PostgreSQL and Redis health checks before running migrations. Temporal may take 15–30 s to finish auto-setup on first start.

### Database

- Prisma schema lives in `prisma/schema.prisma`.
- Push schema: `npx prisma db push`
- Generate client: `npx prisma generate`
- Seed: `npm run db:seed` (idempotent)

### Building packages

The root `tsc -b` / `npm run build` does not work because the root `tsconfig.json` lacks project references. Build packages individually:

```
for pkg in core drive-connector job-intake strategy-engine state-machine browser-broker browser-worker accelerators intelligence workflows api; do
  (cd packages/$pkg && npx tsc -p tsconfig.json)
done
```

The `console` package (React + Vite) should NOT be compiled with `tsc` from the root — it uses `noEmit` and Vite handles bundling. Running `tsc` against console will pollute `src/` with `.js` artifacts that break Vite's dependency scanner.

### Typecheck

Per-package: `cd packages/<name> && npx tsc --noEmit -p tsconfig.json`
Console: `cd packages/console && npx tsc --noEmit`

### Running tests

Tests use Node's built-in test runner with `tsx/cjs` loader:
- `cd packages/api && npm test` (29 tests)
- `cd packages/state-machine && npm test` (139 tests)
- `cd packages/workflows && npm test` (10 tests)
- `cd packages/accelerators && npm test` (9 tests)
- `cd packages/browser-broker && npm test` (skipped without `BRIGHT_DATA_AUTH`)

### Starting dev services

- **API server** (port 4000): `cd /workspace && npx tsx -e "import { startServer } from './packages/api/src/server.js'; startServer({ temporal: { address: 'localhost:7233', namespace: 'default' } });"`
  - No standalone entry-point file exists; you must import and call `startServer()`.
- **Console** (port 3000): `cd packages/console && npx vite --host 0.0.0.0`
  - Vite proxies `/api` requests to `http://localhost:4000`.
- **Temporal UI**: available at `http://localhost:8080` from Docker Compose.

### External API keys (optional for local dev)

- `ANTHROPIC_API_KEY` — needed for LLM-backed intelligence features
- `BRIGHT_DATA_AUTH` — needed for remote browser sessions (local Playwright fallback exists)
- Google OAuth keys — needed for Drive connector features

These are not required for building, testing, or running the API/console in dev mode.
