# ghcr.io/osi4iot/garage
#
# Garage (S3-compatible object store) + a minimal Linux userland + rclone.
#
# The official image (dxflrs/garage) is FROM scratch: one static binary
# and nothing else — no shell, so no entrypoint script, no healthcheck
# helper and no S3 client. This image takes that same binary and puts it
# on Alpine together with:
#
#   - rclone, the S3 client the osi4iot CLI runs inside helper
#     containers (it replaces MinIO's `mc`);
#   - jq, which the provisioning script uses to read `garage json-api`;
#   - tini, so `garage server` gets signals and zombies are reaped.
#
# The Garage binary is musl-static, so it runs unchanged on Alpine.

ARG GARAGE_VERSION=v2.4.1

FROM dxflrs/garage:${GARAGE_VERSION} AS garage

FROM alpine:3.24

ARG TARGETARCH
# NOT named RCLONE_*: a build ARG is in the environment of every RUN below,
# and rclone reads any RCLONE_<FLAG> variable as that flag — an ARG called
# RCLONE_VERSION turns into `rclone --version=v1.75.1` and breaks the build.
ARG RCL_VERSION=v1.75.1
# Pinned from https://github.com/rclone/rclone/releases/download/v1.75.1/SHA256SUMS
ARG RCL_SHA256_AMD64=982b5aa772841168f8e380f139e9e787b2a105403e32b94da8676a0e1c0a13ab
ARG RCL_SHA256_ARM64=03f2504174034b6d004152ed7369251c9a9ec1f7e0836eda420f5c7a5ec0dff9

RUN set -eu; \
    apk add --no-cache ca-certificates jq tini; \
    apk add --no-cache --virtual .fetch curl unzip; \
    case "${TARGETARCH:-amd64}" in \
        amd64) arch=amd64; sum="${RCL_SHA256_AMD64}" ;; \
        arm64) arch=arm64; sum="${RCL_SHA256_ARM64}" ;; \
        *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    zip="rclone-${RCL_VERSION}-linux-${arch}.zip"; \
    curl -fsSL -o "/tmp/${zip}" \
        "https://github.com/rclone/rclone/releases/download/${RCL_VERSION}/${zip}"; \
    echo "${sum}  /tmp/${zip}" | sha256sum -c -; \
    unzip -q "/tmp/${zip}" -d /tmp/rclone; \
    install -m 0755 "/tmp/rclone/rclone-${RCL_VERSION}-linux-${arch}/rclone" /usr/local/bin/rclone; \
    rm -rf /tmp/rclone "/tmp/${zip}"; \
    apk del .fetch; \
    rclone version

COPY --from=garage /garage /usr/local/bin/garage
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY garage-provision.sh /usr/local/bin/garage-provision
RUN chmod 0755 /usr/local/bin/entrypoint.sh /usr/local/bin/garage-provision \
    && mkdir -p /var/lib/garage/meta /var/lib/garage/data \
    && garage --version

# The CLI ships garage.toml as a Swarm secret. Every `garage` command —
# server, health, json-api — reads it from here.
ENV GARAGE_CONFIG_FILE=/run/secrets/garage.toml \
    GARAGE_PROVISION_FILE=/run/secrets/garage_provision \
    RUST_LOG=garage=info

# 3900 S3 API · 3901 RPC between nodes · 3903 admin API (/health, /metrics)
EXPOSE 3900 3901 3903
VOLUME ["/var/lib/garage/meta", "/var/lib/garage/data"]

# `garage health` exits non-zero while the cluster is unavailable, which
# includes "no layout applied yet" — so a fresh node only turns healthy
# once provisioning has given it a role.
HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=5 \
    CMD ["garage", "health", "-q"]

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["server"]