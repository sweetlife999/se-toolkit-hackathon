#!/usr/bin/env bash
set -euo pipefail

TASKS_DB_NAME="${TASKS_DB_NAME:-viberrands_tasks}"

if psql -U "${POSTGRES_USER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TASKS_DB_NAME}'" | grep -q 1; then
  echo "Tasks database already exists: ${TASKS_DB_NAME}"
else
  echo "Creating tasks database: ${TASKS_DB_NAME}"
  createdb -U "${POSTGRES_USER}" "${TASKS_DB_NAME}"
fi

