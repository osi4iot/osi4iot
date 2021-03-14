#!/usr/bin/env bash

echo "################################## Run template_script"
envsubst < /etc/postgres/templates/sql_sript.sql.template > /docker-entrypoint-initdb.d/sql_sript.sql
((sleep 300; rm /docker-entrypoint-initdb.d/sql_sript.sql) & docker-entrypoint.sh postgres)