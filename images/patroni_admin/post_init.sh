#!/bin/bash
# =============================================================
# post_init.sh — executed by Patroni ONCE
# immediately after the admin cluster is bootstrapped.
#
# $1 is the connection string to the default "patroni_admin"
# database passed by Patroni.
# =============================================================
set -euo pipefail

echo "post_init: initializing admin cluster..."

for var in GRAFANA_DB_PASSWORD SUPERADMIN_PASSWORD SUPERADMIN_USER \
           PATRONI_ADMIN_REPLICATOR_PASSWORD PATRONI_ADMIN_REWIND_PASSWORD POSTGRES_DB; do
    if [ -z "${!var:-}" ]; then
        echo "ERROR: $var is not set in environment"
        exit 1
    fi
done

# ── Step 1: run against the default patroni_admin database ($1) ──────────────
echo "post_init: creating roles and platform database..."
psql "$1" << SQL
REVOKE ALL ON SCHEMA public FROM public;
REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC;
REVOKE SELECT ON ALL TABLES IN SCHEMA information_schema FROM PUBLIC;

-- Cluster management roles
CREATE ROLE replicator
    WITH LOGIN PASSWORD '${PATRONI_ADMIN_REPLICATOR_PASSWORD}' REPLICATION;
GRANT pg_monitor TO replicator;

CREATE ROLE rewind_user
    WITH LOGIN PASSWORD '${PATRONI_ADMIN_REWIND_PASSWORD}';
GRANT EXECUTE ON FUNCTION pg_catalog.pg_ls_dir(text, boolean, boolean) TO rewind_user;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_stat_file(text, boolean) TO rewind_user;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_binary_file(text) TO rewind_user;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_binary_file(text, bigint, bigint, boolean) TO rewind_user;

-- Platform administrator — introduced by the platform admin in the wizard
CREATE ROLE ${SUPERADMIN_USER}
    WITH LOGIN PASSWORD '${SUPERADMIN_PASSWORD}' SUPERUSER;

-- Grafana internal role with its own schema
CREATE ROLE grafanadb
    WITH LOGIN PASSWORD '${GRAFANA_DB_PASSWORD}';
ALTER ROLE grafanadb SET search_path TO grafanadb;

-- Platform database
CREATE DATABASE ${POSTGRES_DB}
    WITH ENCODING 'UTF8'
         LC_COLLATE 'C'
         LC_CTYPE 'C.UTF-8'
         TEMPLATE template0;

GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${SUPERADMIN_USER};
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO grafanadb;
SQL

# ── Step 2: run against iot_platform_db ──────────────────────────────────────
PLATFORM_DB_CONN="${1} dbname=${POSTGRES_DB}"
echo "post_init: setting up ${POSTGRES_DB} permissions..."
psql "${PLATFORM_DB_CONN}" << SQL
REVOKE ALL ON SCHEMA public FROM public;
GRANT ALL ON SCHEMA public TO ${SUPERADMIN_USER};
ALTER DEFAULT PRIVILEGES FOR ROLE patroni_admin IN SCHEMA public
    GRANT ALL ON TABLES TO ${SUPERADMIN_USER};
ALTER DEFAULT PRIVILEGES FOR ROLE patroni_admin IN SCHEMA public
    GRANT ALL ON SEQUENCES TO ${SUPERADMIN_USER};

CREATE SCHEMA IF NOT EXISTS grafanadb AUTHORIZATION grafanadb;
GRANT ALL ON SCHEMA grafanadb TO grafanadb;
SQL

echo "post_init: admin cluster initialized successfully"
