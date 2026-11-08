# =============================================================================
# patroni_admin — PostgreSQL 18 + Patroni + WAL-G (with libsodium encryption)
#
# Multi-arch build strategy:
#   amd64 → prebuilt WAL-G binary from GitHub Releases (fast, no CGO needed)
#   arm64 → WAL-G with libsodium compiled from source in the walg-builder
#            stage (git clone, never a tar under QEMU: GNU tar emulated fails
#            on some archives with "Cannot mkdir: Invalid argument").
#   patroni_sidecar (both archs) → pure stdlib Go, cross-compiled with
#            CGO_ENABLED=0 from BUILDPLATFORM — no QEMU needed either way.
#
# Not depending on GitHub: what the build would download from it is taken
# from assets/ when it is there (sh fetch_build_libs.sh fills it once):
#   assets/walg_linux_amd64/wal-g + VERSION   the release binary
#   assets/walg_linux_arm64/wal-g + VERSION   a binary already compiled (taken
#                                             from a published image: no compiling)
#   assets/pgvector/pgvector-<version>.tar.gz, assets/pg_textsearch/
#   pg_textsearch-<version>.tar.gz           the sources (extracted natively)
# --build-arg OFFLINE=1 makes the build fail instead of downloading.
#
# Extensions installed:
#   - pg_textsearch (Tiger Data) — BM25 full-text search (compiled from source)
#   - postgis-3                  — geospatial data
#   - pgvector                   — vector embeddings (compiled from source)
#
# pg_textsearch is in shared_preload_libraries (patroni.yml); pgvector does
# not need preloading. CREATE EXTENSION in each database that needs them
# (post_init.sh does it for the knowledge bases).
#
# Not pg_search (ParadeDB): its community edition does not replicate its
# indexes — a Patroni replica that replays their WAL stops with "replicas
# are not supported on community". pg_textsearch's index is WAL-logged
# like PostgreSQL's own and replays on the replicas.
# =============================================================================

ARG PG_MAJOR=18
ARG WALG_VERSION=v3.0.8
ARG PATRONI_VERSION=4.0.4
ARG PGTEXTSEARCH_VERSION=v1.4.0
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

# ── Stage 1: WAL-G for the target architecture ──────────────────────────────
# assets/walg_linux_<arch>/wal-g when its VERSION is WALG_VERSION; otherwise
# amd64 downloads the release binary and arm64 compiles it with libsodium
# (git clone with retries). Leaves it in /out/wal-g.
FROM golang:1.25-bookworm AS walg-builder

ARG TARGETARCH
ARG WALG_VERSION
ARG OFFLINE=0

RUN --mount=type=bind,source=assets,target=/tmp/assets \
    mkdir -p /out \
    && W="/tmp/assets/walg_linux_${TARGETARCH}" \
    && if [ -f "$W/wal-g" ] && [ "$(cat "$W/VERSION" 2>/dev/null)" = "${WALG_VERSION}" ]; then \
         echo "wal-g ${WALG_VERSION}: assets/walg_linux_${TARGETARCH}" \
         && cp "$W/wal-g" /out/wal-g; \
       elif [ "$OFFLINE" = "1" ]; then \
         echo "OFFLINE=1 and assets/walg_linux_${TARGETARCH} has no wal-g ${WALG_VERSION}" \
              "(VERSION: $(cat "$W/VERSION" 2>/dev/null || echo none)): run fetch_build_libs.sh" && exit 1; \
       elif [ "$TARGETARCH" = "amd64" ]; then \
         curl -fsSL --retry 6 --retry-delay 5 --retry-all-errors \
           "https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-24.04-amd64.tar.gz" \
           -o /tmp/wal-g.tar.gz \
         && tar -xzf /tmp/wal-g.tar.gz -C /tmp \
         && mv /tmp/wal-g-pg-24.04-amd64 /out/wal-g; \
       else \
         echo "wal-g ${WALG_VERSION} for ${TARGETARCH}: compiling it (assets/walg_linux_${TARGETARCH} avoids it)" \
         && apt-get update \
         && apt-get install -y --no-install-recommends cmake make gcc git libsodium-dev \
         && for i in 1 2 3 4 5; do \
              git clone --depth 1 --branch ${WALG_VERSION} https://github.com/wal-g/wal-g.git /tmp/wal-g && break; \
              rm -rf /tmp/wal-g; echo "git clone failed, retrying in 5 s"; sleep 5; \
            done \
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
         && CGO_ENABLED=1 go build -mod vendor -tags "libsodium" -o /out/wal-g -ldflags "${LDFLAGS_WALG}"; \
       fi \
    && chmod +x /out/wal-g

# ── Stage 2: pgvector and pg_textsearch sources (native, no QEMU) ────────────
# From assets/ when they are there, otherwise git clone with retries; on the
# build platform, so tar never runs emulated. Nothing here depends on the
# target: the final image compiles them.
FROM --platform=$BUILDPLATFORM golang:1.25-bookworm AS sources

ARG PGVECTOR_VERSION
ARG PGTEXTSEARCH_VERSION
ARG OFFLINE=0

RUN --mount=type=bind,source=assets,target=/tmp/assets \
    get() { name=$1; version=$2; repo=$3; \
      L="/tmp/assets/${name}/${name}-${version}.tar.gz"; \
      if [ -f "$L" ]; then \
        echo "${name} ${version}: assets/${name}" \
        && mkdir -p "/out/${name}" \
        && tar -xzf "$L" -C "/out/${name}" --strip-components=1; \
      elif [ "$OFFLINE" = "1" ]; then \
        echo "OFFLINE=1 and assets/${name}/${name}-${version}.tar.gz is missing: run fetch_build_libs.sh"; return 1; \
      else \
        for i in 1 2 3 4 5; do \
          git clone --depth 1 --branch "${version}" "${repo}" "/out/${name}" && return 0; \
          rm -rf "/out/${name}"; echo "git clone failed, retrying in 5 s"; sleep 5; \
        done; \
        return 1; \
      fi; }; \
    mkdir -p /out \
    && get pg_textsearch "${PGTEXTSEARCH_VERSION}" https://github.com/timescale/pg_textsearch.git \
    && get pgvector "${PGVECTOR_VERSION}" https://github.com/pgvector/pgvector.git

# ── Stage 3: Final image ──────────────────────────────────────────────────────
FROM ubuntu:24.04

ARG PG_MAJOR
ARG WALG_VERSION
ARG PATRONI_VERSION
ARG PGTEXTSEARCH_VERSION
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
RUN curl -fsSL --retry 6 --retry-delay 5 --retry-all-errors https://www.postgresql.org/media/keys/ACCC4CF8.asc \
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

# ── pg_textsearch — compiled from source ─────────────────────────────────────
# BM25 indexes (CREATE INDEX ... USING bm25). Plain C against PostgreSQL's
# headers, no other dependency: the same build on amd64 and arm64.
# Requires PostgreSQL 17+ and shared_preload_libraries.
# The source comes from the sources stage (assets/ or GitHub), bound
# read-write: what make writes there is discarded with the mount.
RUN --mount=type=bind,from=sources,source=/out/pg_textsearch,target=/tmp/pg_textsearch,rw \
    cd /tmp/pg_textsearch \
    && make PG_CONFIG=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config \
    && make install PG_CONFIG=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config

# ── pgvector — compiled from source ──────────────────────────────────────────
# The PGDG package postgresql-18-pgvector may lag behind releases.
# v0.8.6+ required for PostgreSQL 18 (vacuum_delay_point signature change).
# pgvector does NOT need shared_preload_libraries — use CREATE EXTENSION vector;
RUN --mount=type=bind,from=sources,source=/out/pgvector,target=/tmp/pgvector,rw \
    cd /tmp/pgvector \
    && make PG_CONFIG=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config \
    && make install PG_CONFIG=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config

# ── Patroni ───────────────────────────────────────────────────────────────────
RUN python3 -m venv /opt/patroni \
    && /opt/patroni/bin/pip install --no-cache-dir \
        "patroni[raft]==${PATRONI_VERSION}" \
        psycopg2-binary \
    && ln -s /opt/patroni/bin/patroni                    /usr/local/bin/patroni \
    && ln -s /opt/patroni/bin/patronictl                 /usr/local/bin/patronictl \
    && ln -s /opt/patroni/bin/patroni_raft_controller    /usr/local/bin/patroni_raft_controller

# ── WAL-G ─────────────────────────────────────────────────────────────────────
# From the walg-builder stage: assets/walg_linux_<arch>/, the release binary
# (amd64) or compiled with libsodium (arm64).
COPY --from=walg-builder --chown=root:root /out/wal-g /usr/local/bin/wal-g

# ── patroni_sidecar ───────────────────────────────────────────────────
COPY --from=patroni-sidecar-builder /usr/local/bin/patroni_sidecar /usr/local/bin/patroni_sidecar

# ── WAL-G environment (S3: Garage or AWS) ────────────────────────────────────
# AWS_ENDPOINT stays empty for AWS S3; with Garage the CLI sets it to
# http://garage:3900 on the service. Sensitive values (WALG_LIBSODIUM_KEY,
# each cluster's own S3 key, AWS_REGION) are injected at
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
