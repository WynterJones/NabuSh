#!/bin/sh
set -e

# NABU_MODE selects which half of the app this container runs.
#   web    (default) — the Next.js UI
#   worker           — the scheduler and run executor
MODE="${NABU_MODE:-web}"

if [ -z "$DATABASE_URL" ]; then
  echo "[nabu] DATABASE_URL is not set."
  echo "[nabu] On Railway, add a Postgres service and set DATABASE_URL to \${{Postgres.DATABASE_URL}}."
  exit 1
fi

if [ -z "$NABU_SECRET" ]; then
  echo "[nabu] NABU_SECRET is not set. It encrypts your stored API keys and signs sessions."
  echo "[nabu] Generate one with: openssl rand -hex 32"
  exit 1
fi

case "$MODE" in
  worker)
    echo "[nabu] starting worker"
    # The worker migrates on boot; the web service waits for it below.
    exec npx tsx src/worker/index.ts
    ;;
  web)
    echo "[nabu] starting web on port ${PORT:-3000}"
    # Both services race to migrate, so this is safe — runMigrations takes a
    # Postgres advisory lock and the loser simply waits.
    npx tsx src/db/migrate.ts
    exec npx next start -p "${PORT:-3000}"
    ;;
  *)
    echo "[nabu] unknown NABU_MODE '$MODE' (expected 'web' or 'worker')"
    exit 1
    ;;
esac
