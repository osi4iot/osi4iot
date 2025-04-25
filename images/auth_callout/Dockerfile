FROM golang:1.24 AS builder
ARG CGO_ENABLED=0
WORKDIR /auth_callout

COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN go build -v -o server

FROM alpine:latest
WORKDIR /auth_callout
COPY --from=builder /auth_callout/server ./server
RUN apk add --no-cache tzdata curl
EXPOSE 3300
HEALTHCHECK --interval=10s --timeout=300s --retries=30 \
  CMD curl --fail --insecure http://localhost:3300/health || exit 1
ENTRYPOINT ["./server"]