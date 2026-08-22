#!/bin/bash
# =============================================================
# post_init.sh — executed by Patroni ONCE
# immediately after the metrics cluster is bootstrapped.
#
# $1 is the connection string to the default "postgres" database
# passed by Patroni. We use it to:
#   1. Create iot_data_db and the grafana datasource user
#   2. Connect to iot_data_db to create schemas, extensions,
#      hypertables and policies
# =============================================================
set -euo pipefail

echo "post_init: initializing metrics cluster..."

if [ -z "${GRAFANA_DATASOURCE_PASSWORD:-}" ]; then
    echo "ERROR: GRAFANA_DATASOURCE_PASSWORD is not set in environment"
    exit 1
fi

if [ -z "${DATA_RETENTION_INTERVAL:-}" ]; then
    echo "ERROR: DATA_RETENTION_INTERVAL is not set in environment"
    exit 1
fi

# Strip surrounding quotes if present
export DATA_RETENTION_INTERVAL=$(echo "${DATA_RETENTION_INTERVAL}" | tr -d '"')

# ── Step 1: run against the default postgres database ($1) ───────────────────
# Creates iot_data_db and the grafana datasource user.
# Also tightens global public schema permissions.
echo "post_init: creating iot_data_db and roles..."
psql "$1" << SQL
REVOKE ALL ON SCHEMA public FROM public;
REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC;
REVOKE SELECT ON ALL TABLES IN SCHEMA information_schema FROM PUBLIC;

-- Cluster management roles
CREATE ROLE replicator
    WITH LOGIN PASSWORD '${PATRONI_METRICS_REPLICATOR_PASSWORD}' REPLICATION;
GRANT pg_monitor TO replicator;

CREATE ROLE rewind_user
    WITH LOGIN PASSWORD '${PATRONI_METRICS_REWIND_PASSWORD}';
GRANT EXECUTE ON FUNCTION pg_catalog.pg_ls_dir(text, boolean, boolean) TO rewind_user;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_stat_file(text, boolean) TO rewind_user;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_binary_file(text) TO rewind_user;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_binary_file(text, bigint, bigint, boolean) TO rewind_user;

-- Platform administrator — same superadmin as the admin cluster
CREATE ROLE ${SUPERADMIN_USER}
    WITH LOGIN PASSWORD '${SUPERADMIN_PASSWORD}' SUPERUSER;

CREATE DATABASE iot_data_db
    WITH ENCODING 'UTF8'
         LC_COLLATE 'C'
         LC_CTYPE 'C.UTF-8'
         TEMPLATE template0;

CREATE USER data_source_user_org_1
    WITH PASSWORD '${GRAFANA_DATASOURCE_PASSWORD}';

GRANT CONNECT ON DATABASE iot_data_db TO ${SUPERADMIN_USER};
SQL

# ── Step 2: run against iot_data_db ──────────────────────────────────────────
# Build the connection string for iot_data_db by replacing the dbname in $1.
# Patroni passes something like: "host=localhost port=5432 user=postgres ..."
# We append dbname=iot_data_db which overrides any existing dbname parameter.
IOT_DB_CONN="${1} dbname=iot_data_db"

echo "post_init: running init SQL (schemas, hypertables, policies)..."
SQL=$(envsubst < /etc/patroni/templates/init_metrics.sql.template)
psql "${IOT_DB_CONN}" -c "$SQL"

echo "post_init: metrics cluster initialized successfully"
