#!/usr/bin/env bash

echo "################################## Run template_script"

if [ -f "/run/secrets/timescaledb_grafana.txt" ]
then
    export $(cat /run/secrets/timescaledb_grafana.txt | grep GRAFANA_DATASOURCE_PASSWORD)
    DATA_RETENTION_INTERVAL_LINE=$(cat /run/secrets/timescaledb_data_ret_int.txt | grep DATA_RETENTION_INTERVAL)
    export DATA_RETENTION_INTERVAL=$(echo $DATA_RETENTION_INTERVAL_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
fi

envsubst < /etc/postgres/templates/sql_sript.sql.template > /docker-entrypoint-initdb.d/sql_sript.sql
((sleep 300; rm /docker-entrypoint-initdb.d/sql_sript.sql) & docker-entrypoint.sh postgres)