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
)
if [ "${CERT_RENEWAL_ENABLED:-}" = "true" ]; then
    REQUIRED_VARS+=(
        "PLATFORM_ADMIN_EMAIL"
        "AWS_ACCESS_KEY_ID_ROUTE53" "AWS_SECRET_ACCESS_KEY_ROUTE53"
        "AWS_REGION_ROUTE53" "AWS_HOSTED_ZONE_ID_ROUTE53"
    )
fi
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "ERROR: Required variable '$var' is missing from $SECRET_FILE"
        exit 1
    fi
done

echo "Starting system_manager"
[ "${USE_PATRONI_TOOL:-}" = "true" ] && echo "  backup triggers: NATS request-reply (system_manager.backup.patroni.*)"
[ "${CERT_RENEWAL_ENABLED:-}" = "true" ] && echo "  cert renewal: ${DOMAIN_NAME}"

exec /usr/local/bin/system_manager
