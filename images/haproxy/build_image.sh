docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/haproxy:2.8-alpine --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/haproxy:latest --push .