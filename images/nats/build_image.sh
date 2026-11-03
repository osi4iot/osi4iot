docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/nats:2.15.2-alpine --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/nats:latest --push .