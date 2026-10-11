#!/usr/bin/env bash
set -euo pipefail

echo "################################## Run template_script"

if [ -f "/run/secrets/timescaledb.txt" ]; then
    set -a
    source /run/secrets/timescaledb.txt
    set +a
fi

envsubst < /etc/postgres/templates/sql_sript.sql.template > /docker-entrypoint-initdb.d/sql_sript.sql

docker-entrypoint.sh postgres -c max_connections=200 &
PG_PID=$!
sleep 300 && rm -f /docker-entrypoint-initdb.d/sql_sript.sql
wait $PG_PID