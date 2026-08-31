# =============================================================================
# patroni_admin — PostgreSQL 18 + Patroni + WAL-G (with libsodium encryption)
#
# Multi-arch build strategy:
#   amd64 → prebuilt WAL-G binary from GitHub Releases (fast, no CGO needed)
#   arm64 → multi-stage build: golang:1.24 builder compiles WAL-G natively,
#            avoiding the QEMU tar failure caused by Go test filenames with
#            special characters that the emulated kernel cannot handle.
#   patroni_sidecar (both archs) → pure stdlib Go, cross-compiled with
#            CGO_ENABLED=0 from BUILDPLATFORM — no QEMU needed either way.
#
# Extensions installed:
#   - pg_search  (ParadeDB)  — full-text and semantic search
#   - postgis-3              — geospatial data
#   - pgvector               — vector embeddings (compiled from source)
#
# pgvector is NOT in shared_preload_libraries — it does not need preloading.
# Use CREATE EXTENSION vector; in each database that needs it.
# =============================================================================

ARG PG_MAJOR=18
ARG WALG_VERSION=v3.0.8
ARG PATRONI_VERSION=4.0.4
ARG PGSEARCH_VERSION=0.24.1
ARG PGVECTOR_VERSION=v0.8.6

# ── Stage 0: patroni_sidecar builder (cross-compiled, no QEMU needed) ────────
# Pure stdlib Go binary — same cross-compile trick as system_manager's own
# sm-builder stage, so this needs no QEMU emulation even for arm64.
FROM --platform=$BUILDPLATFORM golang:1.25-bookworm AS patroni-sidecar-builder
ARG TARGETARCH
WORKDIR /src
COPY patroni_sidecar/go.mod ./
COPY patroni_sidecar/main.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -o /usr/local/bin/patroni_sidecar .

# ── Stage 1: WAL-G builder (ARM64 only) ──────────────────────────────────────
# Runs natively on the target platform — no QEMU emulation involved.
# On amd64 this stage is still defined but its output is never used.
FROM golang:1.25-bookworm AS walg-builder

ARG WALG_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        cmake \
        make \
        gcc \
        git \
        libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch ${WALG_VERSION} \
        https://github.com/wal-g/wal-g.git /tmp/wal-g \
    && cd /tmp/wal-g \
    && export USE_LIBSODIUM=true \
    && export GOEXPERIMENT=jsonv2 \
    && ./link_libsodium.sh \
    && go mod vendor \
    && BUILD_DATE=$(date -u +%Y.%m.%d_%H:%M:%S) \
    && GIT_REV=$(git rev-parse --short HEAD) \
    && WALG_VER=$(git tag -l --points-at HEAD) \
    && LDFLAGS_WALG="-s -w -X github.com/wal-g/wal-g/cmd/pg.buildDate=${BUILD_DATE} -X github.com/wal-g/wal-g/cmd/pg.gitRevision=${GIT_REV} -X github.com/wal-g/wal-g/cmd/pg.walgVersion=${WALG_VER}" \
    && cd main/pg \
    && CGO_ENABLED=1 go build \
        -mod vendor \
        -tags "libsodium" \
        -o /usr/local/bin/wal-g \
        -ldflags "${LDFLAGS_WALG}"

# ── Stage 2: Final image ──────────────────────────────────────────────────────
FROM ubuntu:24.04

ARG PG_MAJOR
ARG WALG_VERSION
ARG PATRONI_VERSION
ARG PGSEARCH_VERSION
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

# ── PostgreSQL 18 + PostGIS (from PGDG) ──────────────────────────────────────
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] \
        https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-${PG_MAJOR} \
        postgresql-server-dev-${PG_MAJOR} \
        postgresql-${PG_MAJOR}-postgis-3 \
    && rm -rf /var/lib/apt/lists/*

# ── pg_search (ParadeDB) — installed from ParadeDB GitHub Releases ────────────
# pg_search is NOT in the PGDG apt repo.
# URL pattern: postgresql-<PG>-pg-search_<VER>-1PARADEDB-<codename>_<arch>.deb
RUN ARCH=$(dpkg --print-architecture) \
    && CODENAME=$(lsb_release -cs) \
    && curl -fsSL \
        "https://github.com/paradedb/paradedb/releases/download/v${PGSEARCH_VERSION}/postgresql-${PG_MAJOR}-pg-search_${PGSEARCH_VERSION}-1PARADEDB-${CODENAME}_${ARCH}.deb" \
        -o /tmp/pg_search.deb \
    && apt-get install -y /tmp/pg_search.deb \
    && rm -f /tmp/pg_search.deb \
    && rm -rf /var/lib/apt/lists/*

# ── pgvector — compiled from source ──────────────────────────────────────────
# The PGDG package postgresql-18-pgvector may lag behind releases.
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
# amd64: download the prebuilt binary from GitHub Releases.
# arm64: copy the binary compiled natively in the walg-builder stage.
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then \
        curl -fsSL \
            "https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-24.04-amd64.tar.gz" \
            | tar -xz -C /usr/local/bin/ \
        && mv /usr/local/bin/wal-g-pg-24.04-amd64 /usr/local/bin/wal-g; \
    fi

COPY --from=walg-builder --chown=root:root /usr/local/bin/wal-g /usr/local/bin/wal-g-arm64

RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "arm64" ]; then \
        mv /usr/local/bin/wal-g-arm64 /usr/local/bin/wal-g; \
    else \
        rm -f /usr/local/bin/wal-g-arm64; \
    fi \
    && chmod +x /usr/local/bin/wal-g

# ── patroni_sidecar ───────────────────────────────────────────────────
COPY --from=patroni-sidecar-builder /usr/local/bin/patroni_sidecar /usr/local/bin/patroni_sidecar

# ── WAL-G environment (S3/MinIO) ─────────────────────────────────────────────
# Sensitive values (WALG_LIBSODIUM_KEY, AWS credentials) are injected at
# runtime via /run/secrets/patroni_admin.txt sourced in entrypoint.sh.
# WALG_LIBSODIUM_KEY_TRANSFORM is set in entrypoint.sh to avoid the Docker
# Buildkit false-positive secret scanner (triggers on variable names with KEY).
ENV WALG_COMPRESSION_METHOD=lz4 \
    WALG_S3_CA_CERT_FILE="" \
    AWS_ENDPOINT="" \
    AWS_S3_FORCE_PATH_STYLE="true"

# ── Patroni config + scripts ──────────────────────────────────────────────────
RUN mkdir -p /etc/patroni /data/patroni /data/raft

COPY patroni.yml        /etc/patroni/patroni.yml
COPY post_init.sh       /etc/patroni/post_init.sh
COPY entrypoint.sh      /entrypoint.sh

RUN chmod +x /etc/patroni/post_init.sh /entrypoint.sh

# ── Runtime user ──────────────────────────────────────────────────────────────
RUN mkdir -p /var/run/postgresql \
    && chown postgres:postgres /var/run/postgresql \
    && chown -R postgres:postgres /data /etc/patroni

USER postgres

EXPOSE 5432 8008 5010 8091

ENTRYPOINT ["/entrypoint.sh"]
