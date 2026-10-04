#!/bin/sh
# garage-provision SPEC_FILE
#
# Brings a running Garage node to the state described in SPEC_FILE. Safe
# to run any number of times: every step reads the current state first
# and only changes what differs.
#
# SPEC_FILE (written by the osi4iot CLI, shipped as a Swarm secret):
#
#   bucket   <global-alias>
#   node     <node-id> <zone> <capacity-bytes>
#   key      <name> <access-key-id> <secret-access-key> <perms>
#
# <perms> is any combination of r (read), w (write), o (owner).
#
# Runs on ONE instance of the cluster (the CLI mounts the spec on the
# primary only): keys and buckets are cluster-wide, and two instances
# provisioning at once would only race each other.
#
# Steps:
#   1. wait for the local node's RPC;
#   2. on a cluster with no layout yet, create the first one from the
#      node lines — every instance at once, all IDs being known up
#      front. An existing layout is never touched: from then on it
#      belongs to the osi4iot CLI (scaling, rebalancing);
#   3. wait for `garage health`;
#   4. import every key (re-import when its secret changed, rename,
#      remove the create-bucket flag and any expiration);
#   5. delete keys this script manages that are no longer in the spec;
#   6. create the bucket;
#   7. grant / revoke per-key permissions on it to match the spec.
#
# Everything goes through `garage json-api`, i.e. Garage's admin API
# proxied over the node's local RPC, so no admin token is needed and the
# output is JSON instead of tables.
set -eu

SPEC=${1:-${GARAGE_PROVISION_FILE:-/run/secrets/garage_provision}}
KEY_PREFIX="osi4iot-"
WAIT_SECONDS=${GARAGE_PROVISION_WAIT_SECONDS:-180}

ERRF=$(mktemp)
trap 'rm -f "$ERRF"' EXIT

log() { echo "[garage-provision] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# api ENDPOINT [JSON] — prints the response; on failure the error text
# is left in $ERRF and the exit status is non-zero.
api() {
    garage json-api "$1" "${2:-null}" 2>"$ERRF"
}
# not_found — the last api call failed because the object does not exist
# (NoSuchAccessKey, NoSuchBucket…), as opposed to any other failure.
not_found() { grep -q 'NoSuch' "$ERRF"; }
api_error() { tr '\n' ' ' <"$ERRF"; }

[ -f "$SPEC" ] || die "spec file $SPEC not found"

# ── Parse the spec ───────────────────────────────────────────────────
BUCKET=""
KEYS_FILE=$(mktemp)
NODES_FILE=$(mktemp)
trap 'rm -f "$ERRF" "$KEYS_FILE" "$NODES_FILE"' EXIT

while read -r kind a b c d rest || [ -n "${kind:-}" ]; do
    case "${kind:-}" in
        ""|\#*) ;;
        bucket)   BUCKET=$a ;;
        node)
            [ -n "$a" ] && [ -n "$b" ] && [ -n "$c" ] || die "malformed node line for '${a}'"
            case "$c" in ''|*[!0-9]*|0) die "invalid capacity '$c' for node $a" ;; esac
            printf '%s %s %s\n' "$a" "$b" "$c" >>"$NODES_FILE"
            ;;
        key)
            [ -n "$a" ] && [ -n "$b" ] && [ -n "$c" ] && [ -n "$d" ] \
                || die "malformed key line for '${a}'"
            printf '%s %s %s %s\n' "$a" "$b" "$c" "$d" >>"$KEYS_FILE"
            ;;
        *) die "unknown spec line: $kind" ;;
    esac
done <"$SPEC"

[ -n "$BUCKET" ] || die "the spec names no bucket"

# ── 1. Local RPC ─────────────────────────────────────────────────────
log "Waiting for the local Garage node..."
i=0
until garage json-api GetClusterStatus >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt "$WAIT_SECONDS" ] || die "Garage did not answer on its RPC port"
    sleep 1
done

# ── 2. First layout ──────────────────────────────────────────────────
layout=$(api GetClusterLayout) || die "GetClusterLayout: $(api_error)"
version=$(echo "$layout" | jq .version)
if [ "$version" -eq 0 ] && echo "$layout" | jq -e '(.roles | length) == 0' >/dev/null; then
    [ -s "$NODES_FILE" ] || die "the cluster has no layout and the spec names no nodes"
    staged=$(echo "$layout" | jq '.stagedRoleChanges | length')
    if [ "$staged" -eq 0 ]; then
        roles=$(jq -Rn '[inputs | split(" ") | select(length == 3)
                         | {id: .[0], zone: .[1], capacity: (.[2] | tonumber), tags: []}]' <"$NODES_FILE")
        api UpdateClusterLayout "$(jq -nc --argjson roles "$roles" '{roles: $roles}')" >/dev/null \
            || die "UpdateClusterLayout: $(api_error)"
    fi
    api ApplyClusterLayout '{"version": 1}' >/dev/null || die "ApplyClusterLayout: $(api_error)"
    log "Created the first layout: $(wc -l <"$NODES_FILE" | tr -d ' ') node(s)"
else
    log "Layout v$version exists; it is managed by the osi4iot CLI"
fi

# ── 3. Health ────────────────────────────────────────────────────────
i=0
until garage health -q >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt "$WAIT_SECONDS" ] || die "the cluster did not become healthy"
    sleep 1
done

# ── 4. Keys ──────────────────────────────────────────────────────────
import_key() { # id secret name
    payload=$(jq -nc --arg id "$1" --arg secret "$2" --arg name "$3" \
        '{accessKeyId: $id, secretAccessKey: $secret, name: $name}')
    api ImportKey "$payload" >/dev/null || die "ImportKey $3: $(api_error)"
}

while read -r name id secret perms; do
    full="${KEY_PREFIX}${name}"
    if info=$(api GetKeyInfo "$(jq -nc --arg id "$id" '{id: $id, showSecretKey: true}')"); then
        if [ "$(echo "$info" | jq -r '.secretAccessKey // ""')" != "$secret" ]; then
            api DeleteKey "$(jq -nc --arg id "$id" '{id: $id}')" >/dev/null \
                || die "DeleteKey $full: $(api_error)"
            import_key "$id" "$secret" "$full"
            log "Key $full: secret rotated"
            continue
        fi
        body=$(echo "$info" | jq -c --arg name "$full" '
            {}
            + (if .name != $name then {name: $name} else {} end)
            + (if .permissions.createBucket then {deny: {createBucket: true}} else {} end)
            + (if .expiration != null then {neverExpires: true} else {} end)')
        if [ "$body" != "{}" ]; then
            api UpdateKey "$(jq -nc --arg id "$id" --argjson body "$body" '{id: $id, body: $body}')" \
                >/dev/null || die "UpdateKey $full: $(api_error)"
            log "Key $full: updated $body"
        else
            log "Key $full: up to date"
        fi
    elif not_found; then
        import_key "$id" "$secret" "$full"
        log "Key $full: imported"
    else
        die "GetKeyInfo $full: $(api_error)"
    fi
done <"$KEYS_FILE"

# ── 5. Stale keys ────────────────────────────────────────────────────
# Only keys whose name carries our prefix are ours to delete; anything an
# administrator created by hand is left alone.
wanted_ids=$(awk '{ print $2 }' "$KEYS_FILE" | jq -R . | jq -sc .)
keys=$(api ListKeys) || die "ListKeys: $(api_error)"
echo "$keys" | jq -r --arg p "$KEY_PREFIX" --argjson wanted "$wanted_ids" \
    '.[] | select((.name | startswith($p)) and (.id as $i | $wanted | index($i) | not)) | .id' |
while read -r stale; do
    api DeleteKey "$(jq -nc --arg id "$stale" '{id: $id}')" >/dev/null \
        || die "DeleteKey $stale: $(api_error)"
    log "Key $stale: deleted (no longer in the spec)"
done

# ── 6. Bucket ────────────────────────────────────────────────────────
if bucket=$(api GetBucketInfo "$(jq -nc --arg b "$BUCKET" '{globalAlias: $b}')"); then
    log "Bucket $BUCKET: exists"
elif not_found; then
    bucket=$(api CreateBucket "$(jq -nc --arg b "$BUCKET" '{globalAlias: $b}')") \
        || die "CreateBucket $BUCKET: $(api_error)"
    log "Bucket $BUCKET: created"
else
    die "GetBucketInfo $BUCKET: $(api_error)"
fi
BUCKET_ID=$(echo "$bucket" | jq -r .id)

# ── 7. Permissions ───────────────────────────────────────────────────
# Re-read the bucket: a key re-imported in step 4 lost its permissions.
bucket=$(api GetBucketInfo "$(jq -nc --arg id "$BUCKET_ID" '{id: $id}')") \
    || die "GetBucketInfo $BUCKET: $(api_error)"

while read -r name id secret perms; do
    want_r=false; want_w=false; want_o=false
    case "$perms" in *r*) want_r=true ;; esac
    case "$perms" in *w*) want_w=true ;; esac
    case "$perms" in *o*) want_o=true ;; esac

    change=$(echo "$bucket" | jq -c --arg id "$id" \
        --argjson r "$want_r" --argjson w "$want_w" --argjson o "$want_o" '
        ((.keys[] | select(.accessKeyId == $id) | .permissions)
            // {read: false, write: false, owner: false}) as $cur
        | {
            allow: {read: ($r and ($cur.read | not)),
                    write: ($w and ($cur.write | not)),
                    owner: ($o and ($cur.owner | not))},
            deny:  {read: (($r | not) and $cur.read),
                    write: (($w | not) and $cur.write),
                    owner: (($o | not) and $cur.owner)}
          }')

    for verb in allow deny; do
        p=$(echo "$change" | jq -c ".$verb")
        if echo "$p" | jq -e 'any(.[]; .)' >/dev/null; then
            endpoint=AllowBucketKey
            [ "$verb" = deny ] && endpoint=DenyBucketKey
            api "$endpoint" "$(jq -nc --arg b "$BUCKET_ID" --arg k "$id" --argjson p "$p" \
                '{bucketId: $b, accessKeyId: $k, permissions: $p}')" >/dev/null \
                || die "$endpoint ${KEY_PREFIX}${name}: $(api_error)"
            log "Bucket $BUCKET: $verb ${KEY_PREFIX}${name} $p"
        fi
    done
done <"$KEYS_FILE"

touch /tmp/garage-provisioned
log "Done: bucket '$BUCKET', $(wc -l <"$KEYS_FILE" | tr -d ' ') key(s)"
