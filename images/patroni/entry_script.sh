#!/usr/bin/env bash
set -euo pipefail

echo "################################## Run template_script"

if [ -f "/run/secrets/timescaledb_grafana.txt" ]; then
    export GRAFANA_DATASOURCE_PASSWORD=$(grep GRAFANA_DATASOURCE_PASSWORD /run/secrets/timescaledb_grafana.txt | cut -d= -f2-)
    export DATA_RETENTION_INTERVAL=$(grep DATA_RETENTION_INTERVAL /run/secrets/timescaledb_data_ret_int.txt | cut -d= -f2- | tr -d '"')
fi

envsubst < /etc/postgres/templates/sql_sript.sql.template > /docker-entrypoint-initdb.d/sql_sript.sql

docker-entrypoint.sh postgres &
PG_PID=$!
sleep 300 && rm -f /docker-entrypoint-initdb.d/sql_sript.sql
wait $PG_PID