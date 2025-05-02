########################################
# 1) Builder stage
########################################
FROM --platform=$BUILDPLATFORM golang:1.24 AS builder

# build arguments provided by buildx
ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

# 1.1) Download dependencies and verify modules
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# 1.2) Copy source code and compile the service
COPY . .
RUN CGO_ENABLED=0 \
    GOOS=${TARGETOS:-linux} \
    GOARCH=${TARGETARCH} \
    go build -ldflags="-s -w" \
             -o /usr/local/bin/dev2pdb \
             .

########################################
# 2) Runtime stage
########################################
FROM alpine:latest AS runtime

# Install tzdata and curl and create a non-root user
RUN apk add --no-cache tzdata curl \
 && addgroup -S dev2pdb_group \
 && adduser  -S dev2pdb -G dev2pdb_group

# Copy the compiled binary from the builder stage
COPY --from=builder /usr/local/bin/dev2pdb /usr/local/bin/dev2pdb

WORKDIR /dev2pdb
USER dev2pdb

# Expose application port and define healthcheck
EXPOSE 3300
HEALTHCHECK --interval=10s \
            --timeout=3s \
            --start-period=30s \
            --retries=3 \
  CMD curl -f http://localhost:3300/health || exit 1

# Run the service binary
ENTRYPOINT ["dev2pdb"]