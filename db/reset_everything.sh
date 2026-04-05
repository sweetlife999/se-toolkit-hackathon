#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

POSTGRES_USER="${POSTGRES_USER:-postgres}"
AUTH_DB_NAME="${AUTH_DB_NAME:-viberrands}"
TASKS_DB_NAME="${TASKS_DB_NAME:-viberrands_tasks}"

if [[ "${CONFIRM:-}" != "YES" ]]; then
  echo "This will delete and recreate ${AUTH_DB_NAME} and ${TASKS_DB_NAME}."
  echo "Set CONFIRM=YES to continue."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required"
  exit 1
fi

if ! docker compose ps db >/dev/null 2>&1; then
  docker compose up -d db
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop viberrands-auth >/dev/null 2>&1 || true
fi

terminate_connections() {
  local db_name="$1"
  docker compose exec -T db psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db_name}' AND pid <> pg_backend_pid();" >/dev/null
}

recreate_database() {
  local db_name="$1"
  terminate_connections "${db_name}" || true
  docker compose exec -T db dropdb -U "${POSTGRES_USER}" --if-exists "${db_name}"
  docker compose exec -T db createdb -U "${POSTGRES_USER}" "${db_name}"
}

recreate_database "${AUTH_DB_NAME}"
recreate_database "${TASKS_DB_NAME}"

docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${AUTH_DB_NAME}" -f /docker-entrypoint-initdb.d/init.sql

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart viberrands-auth >/dev/null 2>&1 || true
fi

echo "Reset complete."
echo "Auth DB: ${AUTH_DB_NAME}"
echo "Tasks DB: ${TASKS_DB_NAME}"
echo "Restart the backend if it is not managed by systemd on this machine."


