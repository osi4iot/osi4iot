docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/portainer:1.1.0 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/portainer:latest --push .