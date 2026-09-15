#!/bin/bash
# =============================================================
# post_init.sh — executed by Patroni ONCE
# immediately after the admin cluster is bootstrapped.
#
# $1 is the connection string to the default "patroni_admin"
# database passed by Patroni.
# =============================================================
set -euo pipefail

# ── Restoring from a backup? Then there is nothing to initialize ─────────────
# Patroni calls post_init after a CUSTOM bootstrap too, not only after
# initdb (see patroni/postgresql/bootstrap.py: call_post_bootstrap is
# reached from post_bootstrap regardless of which method ran). After
# `wal-g backup-fetch` the roles, the database and the grants below
# already exist in the restored cluster, so every CREATE ROLE here fails
# with "already exists" — and with `set -euo pipefail` that aborts the
# script, which Patroni reads as a failed bootstrap and the node never
# becomes leader.
#
# Skipping is correct rather than merely convenient: a restored cluster
# is already initialized, by definition.
if [ "${PATRONI_BOOTSTRAP_METHOD:-initdb}" != "initdb" ]; then
    echo "post_init: bootstrapped with '${PATRONI_BOOTSTRAP_METHOD}', the cluster is already initialized — skipping"
    exit 0
fi

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
-- pg_rewind's remote file-list query joins against pg_tablespace to
-- resolve tablespace paths (it does this unconditionally, even with no
-- custom tablespaces in use) — normally unnecessary to grant explicitly
-- since pg_catalog tables are readable by PUBLIC out of the box, but the
-- blanket REVOKE two lines above strips that, so rewind_user needs it
-- back explicitly or every pg_rewind attempt fails with "permission
-- denied for table pg_tablespace" and the node never rejoins the
-- cluster after diverging onto a different timeline.
GRANT SELECT ON pg_tablespace TO rewind_user;

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