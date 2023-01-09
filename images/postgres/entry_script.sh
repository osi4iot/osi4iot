#!/usr/bin/env bash

echo "################################## Run template_script"

if [ -f "/run/secrets/postgres_grafana.txt" ]
then
    export $(cat /run/secrets/postgres_grafana.txt | grep GRAFANA_DB_PASSWORD)
fi

envsubst < /etc/postgres/templates/sql_sript.sql.template > /docker-entrypoint-initdb.d/sql_sript.sql
((sleep 300; rm /docker-entrypoint-initdb.d/sql_sript.sql) & docker-entrypoint.sh postgres)