docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/pgadmin4:9.18.0 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/pgadmin4:latest --push .