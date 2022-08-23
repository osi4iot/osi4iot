docker buildx build --platform linux/amd64 -t ghcr.io/osi4iot/frontend:1.1.0 --push .
docker buildx build --platform linux/amd64 -t ghcr.io/osi4iot/frontend:latest --push .