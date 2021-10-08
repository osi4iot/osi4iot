#!/usr/bin/env bash

echo "################################## Run template_script"

if [ -f "/run/secrets/postgres.txt" ]
then
    export $(cat /run/secrets/postgres.txt | grep POSTGRES_PASSWORD)
    export $(cat /run/secrets/postgres.txt | grep POSTGRES_USER)
    export $(cat /run/secrets/postgres.txt | grep POSTGRES_DB)
    export $(cat /run/secrets/postgres.txt | grep GRAFANA_DB_PASSWORD)
    export $(cat /run/secrets/postgres.txt | grep GRAFANA_DATASOURCE_PASSWORD)
fi

envsubst < /etc/postgres/templates/sql_sript.sql.template > /docker-entrypoint-initdb.d/sql_sript.sql
((sleep 300; rm /docker-entrypoint-initdb.d/sql_sript.sql) & docker-entrypoint.sh postgres)