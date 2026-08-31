#!/bin/bash
set -e

# ── Cluster identity ─────────────────────────────────────────
# Peer naming and the Raft port are the ONLY differences between this
# file and patroni_metrics/entrypoint.sh. Everything below is identical
# and should stay that way — if you change logic here, mirror it there.
PEER_PREFIX="patroni_admin"
RAFT_PORT=5010

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
missing=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        missing+=("$var")
    fi
done
if [ ${#missing[@]} -gt 0 ]; then
    echo "ERROR: ${#missing[@]} required variable(s) missing from $SECRET_FILE:" >&2
    for var in "${missing[@]}"; do
        echo "  - $var" >&2
    done
    exit 1
fi

# ── Required node-specific variables ────────────────────────
if [ -z "${PATRONI_NAME:-}" ]; then
    echo "ERROR: PATRONI_NAME is not set" >&2
    exit 1
fi
if [ -z "${PATRONI_NUM_NODES:-}" ]; then
    echo "ERROR: PATRONI_NUM_NODES is not set" >&2
    exit 1
fi
# Validated as an integer before any arithmetic test touches it: with
# errexit active, `[ "$PATRONI_NUM_NODES" -le 1 ]` on a non-numeric value
# aborts the script with a bare "integer expression expected" and no
# indication of which variable was at fault.
if ! [[ "$PATRONI_NUM_NODES" =~ ^[0-9]+$ ]] || [ "$PATRONI_NUM_NODES" -lt 1 ]; then
    echo "ERROR: PATRONI_NUM_NODES must be a positive integer, got '$PATRONI_NUM_NODES'" >&2
    exit 1
fi
# Raft quorum for a 2-member cluster is 2, so losing either node leaves
# the survivor unable to write to the DCS; it demotes itself and the
# cluster is down. A 2-node cluster therefore has strictly WORSE
# availability than a single node. Valid sizes are 1 (no HA) or an odd
# number >= 3. Warning rather than refusing, so an operator mid-scale
# isn't blocked, but this should never be a steady state.
if [ "$PATRONI_NUM_NODES" -eq 2 ]; then
    echo "WARNING: PATRONI_NUM_NODES=2 — Raft quorum is 2 of 2, so losing either" >&2
    echo "         node takes the whole cluster down. Use 1 or an odd number >= 3." >&2
fi

# ── Build Raft partner_addrs dynamically ─────────────────────
if [ "$PATRONI_NUM_NODES" -le 1 ]; then
    export PATRONI_PARTNER_ADDRS="[]"
else
    ADDRS=""
    for i in $(seq 1 "$PATRONI_NUM_NODES"); do
        PEER_NAME="${PEER_PREFIX}${i}"
        if [ "$PEER_NAME" = "$PATRONI_NAME" ]; then
            continue
        fi
        ENTRY="\"${PEER_NAME}:${RAFT_PORT}\""
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

# ── WAL-G control-connection vars for patroni_sidecar ─────────
# patroni_sidecar (the sidecar HTTP server, launched below) shells out to
# `wal-g backup-push` in LOCAL mode. wal-g still needs a normal SQL
# connection (not just filesystem access) to call pg_backup_start()/
# pg_backup_stop() — these are the credentials for that connection.
#
# NOT exported: PGPASSWORD must stay scoped to patroni_sidecar's own
# process. If exported here, it leaks into the sibling `patroni` process
# below and, through it, into every pg_basebackup subprocess Patroni
# spawns to bootstrap a replica — and in libpq, PGPASSWORD (if set in the
# environment) always takes precedence over PGPASSFILE/.pgpass, no matter
# which role the connection is for. That silently made every replica try
# to authenticate as `replicator` using the superuser's password instead
# of reading /tmp/pgpass, failing every single bootstrap attempt with
# "password authentication failed for user replicator" while the
# replicator password itself was always correct.
PATRONI_SIDECAR_PGHOST=localhost
PATRONI_SIDECAR_PGPORT=5432
PATRONI_SIDECAR_PGUSER=patroni_admin
PATRONI_SIDECAR_PGPASSWORD="$PATRONI_ADMIN_PASSWORD"
PATRONI_SIDECAR_PGDATABASE="$POSTGRES_DB"

# ── Ensure correct data directory permissions ────────────────
mkdir -p /data/patroni
chmod 0700 /data/patroni 2>/dev/null || true
chown -R postgres:postgres /data/patroni 2>/dev/null || true

# ── Wait for sibling nodes to be resolvable in DNS ────────────
# BEST EFFORT ONLY — never fatal, and deliberately short.
#
# One SHARED budget for ALL peers, not one budget PER peer: checking
# every peer each iteration and only giving up once the whole timeout
# has elapsed keeps total wait time bounded to DNS_WAIT_TIMEOUT
# regardless of cluster size. The previous version waited up to
# DNS_WAIT_TIMEOUT for EACH peer in sequence — fine at N=3 (worst case
# 120s), but at N=5 that's up to 240s, comfortably longer than the
# healthcheck's startPeriod + retry budget. Swarm would kill the
# container as unhealthy before entrypoint.sh even got to exec'ing
# patroni, and since a fresh restart resets this loop to zero, no node
# could ever finish booting — an unbreakable restart loop, not a slow one.
#
# The budget is 30s rather than 60s because this loop cannot actually
# guarantee what it looks like it guarantees. On a from-scratch deploy
# all N services are created at once, so a peer's DNS record appears
# only once ITS task is scheduled — every node can legitimately spend
# the whole budget waiting for peers that are themselves waiting. That
# is exactly what the startup logs show: 60s of "Waiting for DNS",
# then the timeout warning, then Patroni logging "failed to resolve
# host" anyway, and everything converging fine ~10s later regardless.
# pysyncobj re-resolves partner addresses on its own schedule
# (dnsFailCacheTime, derived from loop_wait), so an unresolvable peer at
# startup is a transient it already handles. Spending two extra minutes
# here buys nothing and eats into the healthcheck budget.
#
# Missing peers are collected and printed once per iteration instead of
# one line per peer per iteration, which at N=3 turned a 60s wait into
# 60 lines of log.
DNS_WAIT_TIMEOUT=30
if [ "$PATRONI_NUM_NODES" -gt 1 ]; then
    elapsed=0
    while :; do
        unresolved=()
        for i in $(seq 1 "$PATRONI_NUM_NODES"); do
            PEER_NAME="${PEER_PREFIX}${i}"
            if [ "$PEER_NAME" = "$PATRONI_NAME" ]; then
                continue
            fi
            if ! getent hosts "$PEER_NAME" >/dev/null 2>&1; then
                unresolved+=("$PEER_NAME")
            fi
        done
        if [ ${#unresolved[@]} -eq 0 ]; then
            echo "All ${PATRONI_NUM_NODES} peers resolvable in DNS after ${elapsed}s"
            break
        fi
        if [ "$elapsed" -ge "$DNS_WAIT_TIMEOUT" ]; then
            echo "WARNING: after ${elapsed}s still unresolvable: ${unresolved[*]} (continuing anyway; pysyncobj will retry)"
            break
        fi
        echo "Waiting for DNS (${elapsed}s): ${unresolved[*]}"
        sleep 2
        elapsed=$((elapsed + 2))
    done
fi

envsubst < /etc/patroni/patroni.yml > /tmp/patroni.yml

echo "Starting Patroni Admin node: $PATRONI_NAME"
echo "DCS: embedded Raft — peer ${PATRONI_NAME}:${RAFT_PORT}"
echo "Cluster size: $PATRONI_NUM_NODES node(s)"
echo "WAL-G prefix: $WALG_S3_PREFIX"

# ── Graceful shutdown ─────────────────────────────────────────
# THE reason this file exists in its current form. Read before editing.
#
# Docker delivers SIGTERM to PID 1 only. PID 1 here is this bash script,
# not Patroni. Without a trap installed, bash's default action on
# SIGTERM is to die immediately — and when PID 1 in a PID namespace
# dies, the kernel SIGKILLs every remaining process in that namespace.
# Patroni therefore never receives a termination signal at all and never
# runs its shutdown path. Two things follow, both observed in production:
#
#   1. Patroni's Ha.shutdown() calls dcs.delete_leader(), which REMOVES
#      the leader key outright. Skipping it means the key has to expire
#      by TTL instead — and under the Raft DCS, key expiry only runs on
#      the Raft leader (KVStoreTTL._onTick checks _isLeader()), which is
#      the node that just died. A measured `docker service scale
#      <leader>=0` took 118s to fail over: 30s ttl, plus pysyncobj's DNS
#      cache (dnsCacheTime is derived from ttl) holding the dead peer's
#      stale address, plus the Raft re-election that expiry waits on.
#      With this trap the key is deleted explicitly and the survivors
#      race for it on their next loop_wait tick.
#
#   2. pysyncobj writes its Raft journal through mmap and msyncs only
#      occasionally. SIGKILL mid-write leaves the 4-byte
#      LAST_RECORD_OFFSET in page 0 persisted while the page holding the
#      record payload is lost, producing a journal whose length prefix
#      is valid and whose data is zeros. On the next start pysyncobj
#      unpickles those zeros, the _autoTickThread dies with
#      "KeyError: 0", nothing restarts it, and Patroni loops forever on
#      "waiting on raft" without ever exiting non-zero.
#
# The trap must therefore forward SIGTERM AND WAIT. Patroni's shutdown
# includes a Postgres shutdown checkpoint, so the service's
# StopGracePeriod must be long enough to cover it — the builder's 20s
# default is not, and the container gets SIGKILLed mid-checkpoint,
# putting you right back in case 2. Set 90s via WithStopGracePeriod.
shutdown_handler() {
    local signame="$1" signum="$2"
    echo "entrypoint: SIG${signame} received, stopping Patroni cleanly"

    if [ -n "${PATRONI_PID:-}" ]; then
        kill -TERM "$PATRONI_PID" 2>/dev/null || true
    fi
    if [ -n "${SIDECAR_PID:-}" ]; then
        kill -TERM "$SIDECAR_PID" 2>/dev/null || true
    fi

    # Blocking waits. This is the whole point: returning before Patroni
    # has finished is indistinguishable from having no trap at all.
    if [ -n "${PATRONI_PID:-}" ]; then
        wait "$PATRONI_PID" 2>/dev/null || true
    fi
    if [ -n "${SIDECAR_PID:-}" ]; then
        wait "$SIDECAR_PID" 2>/dev/null || true
    fi

    echo "entrypoint: Patroni exited cleanly (leader key released)"
    exit $((128 + signum))
}

# ── Launch Patroni and patroni_sidecar side by side ────────────
# wait -n returns as soon as EITHER process exits, with that process's
# exit code — so if patroni_sidecar dies silently on its own, Patroni
# gets killed too and the whole container exits non-zero. That makes the
# failure visible to Swarm's restart_policy/healthcheck instead of
# leaving a dead sidecar unnoticed next to a perfectly healthy Patroni.
patroni /tmp/patroni.yml &
PATRONI_PID=$!

PGHOST="$PATRONI_SIDECAR_PGHOST" \
PGPORT="$PATRONI_SIDECAR_PGPORT" \
PGUSER="$PATRONI_SIDECAR_PGUSER" \
PGPASSWORD="$PATRONI_SIDECAR_PGPASSWORD" \
PGDATABASE="$PATRONI_SIDECAR_PGDATABASE" \
    patroni_sidecar &
SIDECAR_PID=$!

# Installed only now that both PIDs exist. A signal arriving earlier
# still finds the handler's `-n` guards, so it degrades to a plain exit
# rather than a `kill` with an empty argument.
trap 'shutdown_handler TERM 15' TERM
trap 'shutdown_handler INT 2' INT

# set +e around wait -n: with errexit active, a non-zero return here
# would terminate the script immediately, skipping the cleanup below.
set +e
wait -n "$PATRONI_PID" "$SIDECAR_PID"
EXIT_CODE=$?

# One of the two died on its own. Take the other down and — as in the
# trap — WAIT for it. The previous version sent the signal and exited
# on the next line, so PID 1 was already gone and the kernel SIGKILLed
# the survivor before it could shut down: the same corruption path as
# having no trap, reached from the other direction.
kill -TERM "$PATRONI_PID" "$SIDECAR_PID" 2>/dev/null
wait "$PATRONI_PID" 2>/dev/null
wait "$SIDECAR_PID" 2>/dev/null
set -e

exit "$EXIT_CODE"