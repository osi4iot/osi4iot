# -----------------------------------------------------------------------------
# Step 1: compile the unified system_metrics collector
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.25.1-alpine AS builder

WORKDIR /src

COPY system_metrics/go.mod system_metrics/go.sum ./
RUN go mod download

# Copy all collector sources
COPY system_metrics/main.go    ./
COPY system_metrics/containers.go ./
COPY system_metrics/host.go ./
COPY system_metrics/volumes.go   ./

ARG TARGETOS
ARG TARGETARCH
ARG TARGETPLATFORM
ARG BUILDPLATFORM

RUN echo "Building system_metrics on ${BUILDPLATFORM} for ${TARGETPLATFORM}" && \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build \
      -ldflags="-s -w" \
      -trimpath \
      -o /bin/system_metrics \
      .

# -----------------------------------------------------------------------------
# Step 2: final image based on official Vector image
# -----------------------------------------------------------------------------
FROM timberio/vector:0.46.1-alpine

COPY --from=builder /bin/system_metrics /usr/local/bin/system_metrics

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8686/health || exit 1