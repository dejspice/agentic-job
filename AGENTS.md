# Dejsol Apply OS

State-machine-first agentic job application platform. See `ARCHITECTURE.MD` for full system design and implementation rules.

## Cursor Cloud specific instructions

### Services overview

| Service | Port | How to start |
|---------|------|-------------|
| PostgreSQL (pgvector:pg16) | 5432 | `docker compose up -d postgres` |
| Redis 7 | 6379 | `docker compose up -d redis` |
| Temporal | 7233 | `docker compose up -d temporal` |
| Temporal UI | 8080 | `docker compose up -d temporal-ui` |
| API (Express) | 4000 | `npx tsx -e "import { startServer } from './packages/api/src/server.ts'; startServer({ port: 4000, temporal: { address: 'localhost:7233', namespace: 'default' } });"` |
| Console (Vite+React) | 3000 | `cd packages/console && npm run dev` |

### Startup sequence

1. Docker daemon must be running (`sudo dockerd` if not started).
2. `docker compose up -d` starts Postgres, Redis, Temporal, and Temporal UI.
3. Wait for Postgres healthy before running Prisma commands.
4. `npx prisma db push` syncs the schema; `npx prisma generate` regenerates the client.
5. `npm run db:seed` populates test candidate + 3 job opportunities.
6. Start the API server (port 4000), then the Console dev server (port 3000).

### Gotchas

- **Temporal `DB` driver**: The `docker-compose.yml` uses `DB=postgres12_pgx` (not `postgresql`). Newer `temporalio/auto-setup` images reject `postgresql` as an invalid driver.
- **Docker in Cloud VM**: Docker must use `fuse-overlayfs` storage driver and `iptables-legacy`. The daemon config at `/etc/docker/daemon.json` should include `{"storage-driver": "fuse-overlayfs"}` and the `registry-mirrors` entry `["https://mirror.gcr.io"]` helps with Docker Hub connectivity issues.
- **Console proxy**: The Vite dev server at port 3000 proxies `/api` requests to `http://localhost:4000`. The API server must be running before the console can interact with the backend.
- **API server start**: There is no standalone server entry point file. Use `npx tsx -e` with an inline import of `startServer` from `packages/api/src/server.ts` as shown above, or use `npm run build && node packages/api/dist/index.js` with a custom wrapper.
- **Package manager**: Uses npm workspaces (`package-lock.json`). Do not use pnpm or yarn.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Build all | `npm run build` (or `npm run typecheck`) |
| Prisma generate | `npx prisma generate` |
| Prisma push schema | `npx prisma db push` |
| Seed database | `npm run db:seed` |
| Run all infra | `docker compose up -d` |
| Stop all infra | `docker compose down` |

### Running tests

Tests use Node.js built-in test runner with `tsx` loader. No eslint or prettier config exists in the repo.

| Package | Command | Notes |
|---------|---------|-------|
| state-machine | `npm test` | 139 unit tests |
| state-machine | `npm run test:hardening` | 15 hardening tests |
| workflows | `npm test` | 10 unit tests |
| workflows | `npm run test:integration` | 21 integration tests |
| api | `npm test` | 33 persistence tests |
| accelerators | `npm test` | 9 deterministic resolution tests |
| browser-broker | `npm test` | Skips unless `BRIGHT_DATA_AUTH` is set |
