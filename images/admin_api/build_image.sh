docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/admin_api:1.3.0 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/admin_api:latest --push .