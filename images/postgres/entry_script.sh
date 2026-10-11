#!/usr/bin/env bash

echo "################################## Run template_script"

if [ -f "/run/secrets/postgres.txt" ]; then
    set -a
    source /run/secrets/postgres.txt
    set +a
fi

envsubst < /etc/postgres/templates/sql_sript.sql.template > /docker-entrypoint-initdb.d/sql_sript.sql
((sleep 300; rm /docker-entrypoint-initdb.d/sql_sript.sql) & docker-entrypoint.sh postgres)