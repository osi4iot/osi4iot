# =============================================================================
# system_manager — scheduled backup triggers for patroni-admin and
# patroni-metrics (delegated over HTTP to backup_trigger on each node),
# plus ACME/Route53 certificate renewal (traefik + nats), gated
# independently via BACKUPS_ENABLED / CERT_RENEWAL_ENABLED. Fully
# standalone module (module system_manager, see go.mod) — no dependency
# on any external/private repo.
#
# Multi-arch build strategy:
#   system_manager binary → cross-compiled with CGO_ENABLED=0 from the
#     build platform (BUILDPLATFORM) for TARGETARCH. Pure Go, no cgo,
#     so this needs no QEMU even for arm64.
#
# This image never touches Postgres or S3 directly: backups are
# triggered over HTTP against backup_trigger (running inside
# patroni_admin/patroni_metrics, with local PGDATA access and its own
# S3/WAL-G credentials) — so this image needs no wal-g binary, no
# Postgres/Patroni packages, and no S3/WAL-G credentials of its own.
# =============================================================================

# ── Stage 1: compile system_manager (cross-compiled, no QEMU needed) ────────
#
# Standalone module — package main lives at cmd/system_manager/, with the
# actual logic split across internal/ (backup, certrenewer, dockersvc,
# config, schedule, platform). Build context is just this directory.
FROM --platform=$BUILDPLATFORM golang:1.25-bookworm AS sm-builder
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -o /usr/local/bin/system_manager ./cmd/system_manager

# ── Stage 2: final image ─────────────────────────────────────────────────────
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=sm-builder /usr/local/bin/system_manager /usr/local/bin/system_manager
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Runs as root: reading /var/run/docker.sock (cert-renewal job) needs to
# match the host socket's uid/gid, which varies by host, so a fixed
# non-root user is more fragile here than accepting root — same
# trade-off tools like Portainer or Watchtower make for the same reason.
# Deployments with only BACKUPS_ENABLED (no cert renewal, no socket
# mount) don't strictly need root, but splitting the image in two just
# for that isn't worth it.

EXPOSE 8090

ENTRYPOINT ["/entrypoint.sh"]