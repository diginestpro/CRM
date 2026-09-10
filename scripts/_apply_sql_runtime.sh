#!/bin/bash
# Internal helper invoked by apply_sql_docker.ps1 via
#   docker run --rm --network=host -v <projectRoot>:/work postgres:17 \
#     bash /work/scripts/_apply_sql_runtime.sh
#
# Connects to the Supabase DB over IPv4 (the direct hostname is
# IPv6-only) and runs the SQL file passed in via env var SQL_PATH.
set -e

DB_HOST="$1"
SQL_PATH="$2"

IP=$(getent ahosts "$DB_HOST" | awk '{print $1}' | grep -E '^[0-9a-fA-F:]+$' | head -n1)

if [ -z "$IP" ]; then
  echo "ERROR: could not resolve $DB_HOST" >&2
  exit 1
fi

echo "==> Resolved $DB_HOST -> $IP"
echo "==> Applying $SQL_PATH ..."

# PGPASSWORD is supplied by docker -e
psql -h "$IP" -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$SQL_PATH"

echo "==> Done."
