#!/bin/bash
set -e

SECRET_FILE="/run/secrets/system_manager.txt"
if [ ! -f "$SECRET_FILE" ]; then
    echo "ERROR: Secret '$SECRET_FILE' not found"
    exit 1
fi

set -a
# shellcheck source=/dev/null
source "$SECRET_FILE"
set +a

# DOMAIN_NAME, NATS_NKEY_SEED and the AWS/S3 credentials are always in
# the secret now (see secrets/system_manager.go) — system_manager needs
# S3/MinIO access unconditionally, and DOMAIN_NAME doubles as the TLS
# ServerName for the NATS connection. Only Route53/ACME stays gated by
# CERT_RENEWAL_ENABLED. See system_manager.go (services) for
# USE_PATRONI_TOOL / CERT_RENEWAL_ENABLED.
REQUIRED_VARS=(
    "DOMAIN_NAME" "NATS_NKEY_SEED"
    "AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY" "AWS_REGION"
    "NATS_BACKUP_S3_PREFIX"
)
if [ "${CERT_RENEWAL_ENABLED:-}" = "true" ]; then
    # PLATFORM_ENCRYPTION_KEY is the master key internal/certstore
    # derives its own subkey from, to read and write
    # /data/certrenewer/domain_certs.enc and to decrypt the initial
    # certificates the CLI ships in the system_manager_certs secret.
    # Without it this service cannot read its own state, so it belongs
    # with the other hard requirements rather than being discovered at
    # the first renewal.
    REQUIRED_VARS+=(
        "PLATFORM_ADMIN_EMAIL"
        "AWS_ACCESS_KEY_ID_ROUTE53" "AWS_SECRET_ACCESS_KEY_ROUTE53"
        "AWS_REGION_ROUTE53" "AWS_HOSTED_ZONE_ID_ROUTE53"
        "PLATFORM_ENCRYPTION_KEY"
    )
fi

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "ERROR: Required variable '$var' is missing from $SECRET_FILE"
        exit 1
    fi
done

echo "Starting system_manager"
[ "${USE_PATRONI_TOOL:-}" = "true" ] && echo "  patroni tasks: NATS request-reply (system_manager.patroni.trigger_backup.*, .backup_list.*, .flush_wal.*, .leader.*)"
[ "${CERT_RENEWAL_ENABLED:-}" = "true" ] && echo "  cert renewal: ${DOMAIN_NAME}"
echo "  nats backup tasks: NATS request-reply (system_manager.nats_streams.backup, .restore, .list) -> ${NATS_BACKUP_S3_PREFIX:-}"
[ -n "${STATE_FILE_S3_PREFIX:-}" ] && echo "  state file tasks: NATS request-reply (system_manager.state_file.backup, .restore, .list) -> ${STATE_FILE_S3_PREFIX}"

echo "Waiting for auth_callout..."
until curl -sf http://auth_callout:3300/health >/dev/null 2>&1; do
    sleep 2
done
echo "auth_callout ready"

exec /usr/local/bin/system_manager