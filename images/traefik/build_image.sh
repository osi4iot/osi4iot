docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/traefik:v2.7 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/traefik:latest --push .