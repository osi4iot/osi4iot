docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/patroni_admin:18.4-alpine3.24 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/patroni_admin:latest --push .
