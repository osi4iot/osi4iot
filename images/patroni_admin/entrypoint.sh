#!/bin/bash
set -e

SECRET_FILE="/run/secrets/patroni_admin.txt"
if [ ! -f "$SECRET_FILE" ]; then
    echo "ERROR: Secret '$SECRET_FILE' not found"
    exit 1
fi

set -a
# shellcheck source=/dev/null
source "$SECRET_FILE"
set +a

# ── Required variables from secret ───────────────────────────
REQUIRED_VARS=(
    "PATRONI_ADMIN_PASSWORD"
    "PATRONI_ADMIN_REPLICATOR_PASSWORD"
    "PATRONI_ADMIN_REWIND_PASSWORD"
    "SUPERADMIN_USER"
    "SUPERADMIN_PASSWORD"
    "GRAFANA_DB_PASSWORD"
    "POSTGRES_DB"
    "WALG_S3_PREFIX"
    "WALG_LIBSODIUM_KEY"
    "AWS_ACCESS_KEY_ID"
    "AWS_SECRET_ACCESS_KEY"
)
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "ERROR: Required variable '$var' is missing from $SECRET_FILE"
        exit 1
    fi
done

# ── Required node-specific variables ────────────────────────
if [ -z "$PATRONI_NAME" ]; then
    echo "ERROR: PATRONI_NAME is not set"
    exit 1
fi
if [ -z "$PATRONI_NUM_NODES" ]; then
    echo "ERROR: PATRONI_NUM_NODES is not set"
    exit 1
fi

# ── Build Raft partner_addrs dynamically ─────────────────────
if [ "$PATRONI_NUM_NODES" -le 1 ]; then
    export PATRONI_PARTNER_ADDRS="[]"
else
    ADDRS=""
    for i in $(seq 1 "$PATRONI_NUM_NODES"); do
        PEER_NAME="patroni-admin${i}"
        if [ "$PEER_NAME" = "$PATRONI_NAME" ]; then
            continue
        fi
        ENTRY="\"${PEER_NAME}:5010\""
        if [ -z "$ADDRS" ]; then
            ADDRS="$ENTRY"
        else
            ADDRS="$ADDRS, $ENTRY"
        fi
    done
    export PATRONI_PARTNER_ADDRS="[$ADDRS]"
fi

# ── WAL-G libsodium encoding format ─────────────────────────
export WALG_LIBSODIUM_KEY_TRANSFORM=hex

# ── WAL-G control-connection vars for backup_trigger ─────────
# backup_trigger (the sidecar HTTP server, launched below) shells out to
# `wal-g backup-push` in LOCAL mode. wal-g still needs a normal SQL
# connection (not just filesystem access) to call pg_backup_start()/
# pg_backup_stop() — these are the credentials for that connection.
export PGHOST=localhost
export PGPORT=5432
export PGUSER=patroni_admin
export PGPASSWORD="$PATRONI_ADMIN_PASSWORD"
export PGDATABASE="$POSTGRES_DB"

# ── Ensure correct data directory permissions ────────────────
mkdir -p /data/patroni
chmod 0700 /data/patroni 2>/dev/null || true
chown -R postgres:postgres /data/patroni 2>/dev/null || true

# ── Wait for sibling nodes to be resolvable in DNS ────────────
DNS_WAIT_TIMEOUT=60
if [ "$PATRONI_NUM_NODES" -gt 1 ]; then
    for i in $(seq 1 "$PATRONI_NUM_NODES"); do
        PEER_NAME="patroni-admin${i}"
        if [ "$PEER_NAME" = "$PATRONI_NAME" ]; then
            continue
        fi
        elapsed=0
        until getent hosts "$PEER_NAME" >/dev/null 2>&1; do
            if [ "$elapsed" -ge "$DNS_WAIT_TIMEOUT" ]; then
                echo "WARNING: timed out waiting for DNS: $PEER_NAME (continuing anyway)"
                break
            fi
            echo "Waiting for DNS: $PEER_NAME"
            sleep 2
            elapsed=$((elapsed + 2))
        done
    done
fi

envsubst < /etc/patroni/patroni.yml > /tmp/patroni.yml

echo "Starting Patroni Admin node: $PATRONI_NAME"
echo "DCS: embedded Raft — peer ${PATRONI_NAME}:5010"
echo "Cluster size: $PATRONI_NUM_NODES node(s)"
echo "WAL-G prefix: $WALG_S3_PREFIX"

# ── Launch Patroni and backup_trigger side by side ────────────
# wait -n returns as soon as EITHER process exits, with that process's
# exit code — so if backup_trigger dies silently on its own, Patroni
# gets killed too and the whole container exits non-zero. That makes the
# failure visible to Swarm's restart_policy/healthcheck instead of
# leaving a dead sidecar unnoticed next to a perfectly healthy Patroni.
patroni /tmp/patroni.yml &
PATRONI_PID=$!

backup_trigger &
TRIGGER_PID=$!

# set +e around wait -n: with errexit active, a non-zero return here
# would terminate the script immediately, skipping the cleanup below.
set +e
wait -n "$PATRONI_PID" "$TRIGGER_PID"
EXIT_CODE=$?
set -e

kill "$PATRONI_PID" "$TRIGGER_PID" 2>/dev/null || true
exit "$EXIT_CODE"
