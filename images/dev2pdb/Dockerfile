FROM --platform=$BUILDPLATFORM golang:1.18 as builder

ARG TARGETARCH

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -a -o /app/output/dev2pdb ./...

FROM alpine:latest
WORKDIR /
COPY --from=builder /app/output/dev2pdb /dev2pdb
RUN apk --no-cache add curl
EXPOSE 3300
HEALTHCHECK --interval=10s --timeout=300s --retries=30 \
  CMD curl --fail --insecure http://localhost:3300/health || exit 1
ENTRYPOINT ["/dev2pdb"]