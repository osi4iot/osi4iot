#!/bin/sh
# Entrypoint of ghcr.io/osi4iot/garage.
#
#   server  → start `garage server`, then provision it (layout, keys,
#             bucket, permissions) from $GARAGE_PROVISION_FILE, and stay
#             attached to the server process.
#   other   → run the command as given (`garage status`, `rclone …`,
#             `sleep …` for the CLI's helper containers).
#
# Provisioning runs on EVERY start and is idempotent, so a redeploy with
# a new provisioning secret (rotated keys, new bucket name) is applied by
# the restart Swarm already does when a secret changes.
set -eu

if [ "${1:-server}" != "server" ]; then
    exec "$@"
fi
[ $# -gt 0 ] && shift

if [ ! -f "${GARAGE_CONFIG_FILE}" ]; then
    echo "ERROR: Garage configuration not found at ${GARAGE_CONFIG_FILE}" >&2
    exit 1
fi

# ── Node identity ──────────────────────────────────────────────────────
# The osi4iot CLI generates each instance's identity (Garage's node_key:
# a 64-byte ed25519 key) and ships it as a secret, so every node ID is
# known before any instance starts. Installed before Garage's first
# start; on every later start it must still be the same key — a
# different one means these volumes belong to another instance, and
# starting would put the wrong node in the cluster.
META_DIR=${GARAGE_META_DIR:-/var/lib/garage/meta}
if [ -n "${GARAGE_NODE_KEY_FILE:-}" ] && [ -f "${GARAGE_NODE_KEY_FILE}" ]; then
    if [ "$(wc -c <"${GARAGE_NODE_KEY_FILE}" | tr -d ' ')" -ne 64 ]; then
        echo "ERROR: ${GARAGE_NODE_KEY_FILE} is not a 64-byte Garage node key" >&2
        exit 1
    fi
    mkdir -p "$META_DIR"
    if [ -f "$META_DIR/node_key" ]; then
        if ! cmp -s "${GARAGE_NODE_KEY_FILE}" "$META_DIR/node_key"; then
            echo "ERROR: the metadata volume holds a different Garage node identity than" >&2
            echo "  this instance's. The volumes belong to another instance; refusing to start." >&2
            exit 1
        fi
    else
        cp "${GARAGE_NODE_KEY_FILE}" "$META_DIR/node_key"
        chmod 0600 "$META_DIR/node_key"
        # The public half, which `garage node id` (and so health checks
        # and provisioning) reads.
        tail -c 32 "$META_DIR/node_key" >"$META_DIR/node_key.pub"
        echo "Installed this instance's Garage node identity" >&2
    fi
fi

garage server "$@" &
server_pid=$!

stopping=0
stop_server() {
    stopping=1
    kill -TERM "$server_pid" 2>/dev/null || true
}
trap stop_server TERM INT

if [ -f "${GARAGE_PROVISION_FILE}" ]; then
    if ! garage-provision "${GARAGE_PROVISION_FILE}"; then
        if [ "$stopping" -eq 0 ]; then
            # A Garage that is up but unprovisioned would look healthy to
            # nobody and serve requests with keys it does not know. Exit
            # instead, so Swarm restarts the task and the failure is in
            # `docker service logs garage`.
            echo "ERROR: garage-provision failed; stopping Garage so the task is restarted" >&2
            stop_server
        fi
        wait "$server_pid" 2>/dev/null || true
        exit 1
    fi
else
    echo "No provisioning file at ${GARAGE_PROVISION_FILE}; Garage starts unprovisioned" >&2
fi

set +e
wait "$server_pid"
status=$?
if [ "$stopping" -eq 1 ]; then
    # The first wait returns as soon as the trap runs; wait for the
    # server to actually finish shutting down.
    wait "$server_pid" 2>/dev/null
    exit 0
fi
exit "$status"
