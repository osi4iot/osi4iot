# =============================================================================
# patroni_metrics — TimescaleDB 2.29.1 / PostgreSQL 18 + Patroni + WAL-G
#
# Multi-arch build strategy:
#   Both amd64 and arm64 use the prebuilt WAL-G binary published on GitHub
#   Releases (wal-g-pg-24.04-<arch>.tar.gz) — nothing is compiled from
#   source, so no Go toolchain or libsodium build dependencies are needed
#   in this image for WAL-G itself.
#   backup_trigger (both archs) → pure stdlib Go, cross-compiled with
#   CGO_ENABLED=0 from BUILDPLATFORM — no QEMU needed either way.
#
# Extensions installed:
#   - timescaledb  — time-series data and hypertables
#   - pgvector     — vector embeddings (compiled from source)
#
# pgvector is NOT in shared_preload_libraries — it does not need preloading.
# Use CREATE EXTENSION vector; in each database that needs it.
# timescaledb MUST be first in shared_preload_libraries.
# =============================================================================

ARG PG_MAJOR=18
ARG WALG_VERSION=v3.0.8
ARG PATRONI_VERSION=4.0.4
ARG TIMESCALE_VERSION=2.29.1
ARG PGVECTOR_VERSION=v0.8.6

# ── Stage 0: backup_trigger builder (cross-compiled, no QEMU needed) ────────
# Pure stdlib Go binary — same cross-compile trick as system_manager's own
# sm-builder stage, so this needs no QEMU emulation even for arm64.
FROM --platform=$BUILDPLATFORM golang:1.25-bookworm AS backup-trigger-builder
ARG TARGETARCH
WORKDIR /src
COPY backup_trigger/go.mod ./
COPY backup_trigger/main.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -o /usr/local/bin/backup_trigger .

# ── Stage 1: final image ─────────────────────────────────────────────────────
FROM ubuntu:24.04

ARG PG_MAJOR
ARG WALG_VERSION
ARG PATRONI_VERSION
ARG TIMESCALE_VERSION
ARG PGVECTOR_VERSION

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    PG_MAJOR=${PG_MAJOR}

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        gnupg \
        lsb-release \
        gettext-base \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        libpq-dev \
        gcc \
        make \
        git \
    && rm -rf /var/lib/apt/lists/*

# ── PostgreSQL 18 (from PGDG) ─────────────────────────────────────────────────
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] \
        https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-${PG_MAJOR} \
        postgresql-server-dev-${PG_MAJOR} \
    && rm -rf /var/lib/apt/lists/*

# ── TimescaleDB (from packagecloud) ──────────────────────────────────────────
# No version pin — always installs the latest available version.
# TIMESCALE_VERSION ARG documents the expected version for reference.
RUN curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey \
        | gpg --dearmor -o /usr/share/keyrings/timescaledb.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/timescaledb.gpg] \
        https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -cs) main" \
        > /etc/apt/sources.list.d/timescaledb.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        timescaledb-2-postgresql-${PG_MAJOR} \
    && rm -rf /var/lib/apt/lists/*

# ── pgvector — compiled from source ──────────────────────────────────────────
# v0.8.6+ required for PostgreSQL 18 (vacuum_delay_point signature change).
# pgvector does NOT need shared_preload_libraries — use CREATE EXTENSION vector;
RUN git clone --depth 1 --branch ${PGVECTOR_VERSION} \
        https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && cd /tmp/pgvector \
    && make PG_CONFIG=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config \
    && make install PG_CONFIG=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config \
    && rm -rf /tmp/pgvector

# ── Patroni ───────────────────────────────────────────────────────────────────
RUN python3 -m venv /opt/patroni \
    && /opt/patroni/bin/pip install --no-cache-dir \
        "patroni[raft]==${PATRONI_VERSION}" \
        psycopg2-binary \
    && ln -s /opt/patroni/bin/patroni                    /usr/local/bin/patroni \
    && ln -s /opt/patroni/bin/patronictl                 /usr/local/bin/patronictl \
    && ln -s /opt/patroni/bin/patroni_raft_controller    /usr/local/bin/patroni_raft_controller

# ── WAL-G ─────────────────────────────────────────────────────────────────────
RUN ARCH=$(dpkg --print-architecture) \
    && case "$ARCH" in \
         amd64)   WALG_ARCH=amd64   ;; \
         arm64)   WALG_ARCH=aarch64 ;; \
         *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
       esac \
    && curl -fsSL \
        "https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-24.04-${WALG_ARCH}.tar.gz" \
        | tar -xz -C /usr/local/bin/ \
    && mv "/usr/local/bin/wal-g-pg-24.04-${WALG_ARCH}" /usr/local/bin/wal-g \
    && chmod +x /usr/local/bin/wal-g

# ── backup_trigger sidecar ───────────────────────────────────────────────────
COPY --from=backup-trigger-builder /usr/local/bin/backup_trigger /usr/local/bin/backup_trigger

# ── WAL-G environment (S3/MinIO) ─────────────────────────────────────────────
ENV WALG_COMPRESSION_METHOD=lz4 \
    WALG_S3_CA_CERT_FILE="" \
    AWS_ENDPOINT="" \
    AWS_S3_FORCE_PATH_STYLE="true"

# ── Patroni config + scripts ──────────────────────────────────────────────────
RUN mkdir -p /etc/patroni/templates /data/patroni /data/raft

COPY patroni.yml                               /etc/patroni/patroni.yml
COPY post_init.sh                              /etc/patroni/post_init.sh
COPY entrypoint.sh                              /entrypoint.sh
COPY templates/init_metrics.sql.template       /etc/patroni/templates/init_metrics.sql.template

RUN chmod +x /etc/patroni/post_init.sh /entrypoint.sh

# ── Runtime user ──────────────────────────────────────────────────────────────
RUN mkdir -p /var/run/postgresql \
    && chown postgres:postgres /var/run/postgresql \
    && chown -R postgres:postgres /data /etc/patroni

USER postgres

EXPOSE 5432 8008 5011 8091

ENTRYPOINT ["/entrypoint.sh"]
