docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/postgres:1.1.0 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/postgres:latest --push .