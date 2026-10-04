# ghcr.io/osi4iot/garage_webui
#
# Garage Web UI (https://github.com/khairul169/garage-webui), built from
# source at a pinned release, for the platform's garage_webui service.
#
# Differences from the upstream image (khairul169/garage-webui):
#
#   - Reproducible: the source is the release tag AND its commit, checked
#     against each other, so a moved tag fails the build; pnpm and every
#     base image are pinned (upstream uses pnpm@latest and an untagged
#     alpine).
#   - Alpine base with curl from the distribution, instead of FROM scratch
#     with a curl binary copied out of a third-party image.
#   - Runs as an unprivileged user (uid 10001). The application writes
#     nothing to disk.
#   - Its working directory is /app, so it reads its configuration from
#     /app/.env: that is where the osi4iot CLI mounts the garage_webui
#     secret, readable by uid 10001 only.
#   - Cross-compiled: the frontend and the Go backend are built once on
#     the build machine's architecture, no emulation for arm64.
#
# Build ARGs carry no NODE_, NPM_, PNPM_, GO or RCLONE_ prefix: an ARG
# is in the environment of every RUN after it, and those tools read
# variables with their prefix as configuration (an ARG named
# RCLONE_VERSION once broke the garage image's build exactly that way).

ARG GARAGE_WEBUI_VERSION=1.1.0
ARG GARAGE_WEBUI_COMMIT=a6640157c1a757c92aa539149df0d902283e6763

# ── Source ────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM alpine:3.24 AS source
ARG GARAGE_WEBUI_VERSION
ARG GARAGE_WEBUI_COMMIT
RUN set -eu; \
    apk add --no-cache git; \
    git clone --quiet --depth 1 --branch "${GARAGE_WEBUI_VERSION}" \
        https://github.com/khairul169/garage-webui.git /src; \
    actual=$(git -C /src rev-parse HEAD); \
    if [ "$actual" != "${GARAGE_WEBUI_COMMIT}" ]; then \
        echo "tag ${GARAGE_WEBUI_VERSION} is ${actual}, expected ${GARAGE_WEBUI_COMMIT}" >&2; \
        exit 1; \
    fi; \
    rm -rf /src/.git

# ── Frontend (architecture independent) ───────────────────────────────
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend
# pnpm 9 reads the project's lockfile (lockfileVersion 9.0) as is.
ARG BUILD_PNPM_RELEASE=9.15.9
RUN npm install --global --no-fund --no-audit "pnpm@${BUILD_PNPM_RELEASE}"
WORKDIR /src
COPY --from=source /src/package.json /src/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY --from=source /src/ ./
RUN pnpm run build

# ── Backend, cross-compiled for the target ────────────────────────────
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS backend
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src/backend
COPY --from=source /src/backend/go.mod /src/backend/go.sum ./
RUN go mod download
COPY --from=source /src/backend/ ./
# The UI is embedded in the binary (go:embed, build tag "prod").
COPY --from=frontend /src/dist ./ui/dist
RUN CGO_ENABLED=0 GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    go build -trimpath -ldflags "-s -w -buildid=" -tags prod -o /out/garage-webui .

# ── Runtime ───────────────────────────────────────────────────────────
FROM alpine:3.24

RUN apk add --no-cache ca-certificates curl \
    && addgroup -S -g 10001 garagewebui \
    && adduser -S -D -H -u 10001 -G garagewebui -h /app garagewebui

COPY --from=backend /out/garage-webui /usr/local/bin/garage-webui

WORKDIR /app
USER 10001:10001

ENV HOST=0.0.0.0 \
    PORT=3909

EXPOSE 3909

# The page under BASE_PATH (the osi4iot service sets /garage_webui and
# its own, identical check).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl --fail --silent --output /dev/null "http://127.0.0.1:${PORT}${BASE_PATH}/" || exit 1

ENTRYPOINT ["/usr/local/bin/garage-webui"]
