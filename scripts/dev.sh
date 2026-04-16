#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "==> Starting services via docker compose..."
docker compose up -d

echo "==> Waiting for PostgreSQL..."
until docker compose exec -T postgres pg_isready -U dejsol > /dev/null 2>&1; do
  sleep 1
done
echo "    PostgreSQL is ready."

echo "==> Waiting for Redis..."
until docker compose exec -T redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "    Redis is ready."

echo "==> Waiting for Temporal (port 7233)..."
timeout=60
elapsed=0
until docker compose exec -T temporal tctl cluster health 2>/dev/null | grep -q SERVING || [ $elapsed -ge $timeout ]; do
  sleep 2
  elapsed=$((elapsed + 2))
done
if [ $elapsed -ge $timeout ]; then
  echo "    Temporal may still be starting — check 'docker compose logs temporal'"
else
  echo "    Temporal is ready."
fi

echo "==> Running Prisma migrations..."
npx prisma migrate dev --name init 2>/dev/null || npx prisma db push

echo ""
echo "==> Dev environment is up."
echo "    PostgreSQL:  localhost:5432"
echo "    Redis:       localhost:6379"
echo "    Temporal:    localhost:7233"
echo "    Temporal UI: http://localhost:8080"
echo ""
echo "    To start the API:     TEMPORAL_ADDRESS=localhost:7233 node packages/api/dist/start.js"
echo "    To start the worker:  TEMPORAL_ADDRESS=localhost:7233 node packages/worker/dist/start.js"
