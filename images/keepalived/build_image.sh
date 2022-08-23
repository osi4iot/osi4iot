docker buildx build --platform linux/amd64 -t ghcr.io/osi4iot/keepalived:1.1.0 --push .
docker buildx build --platform linux/amd64 -t ghcr.io/osi4iot/keepalived:latest --push .