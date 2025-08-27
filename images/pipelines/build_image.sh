docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/pipelines:1.3.0 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/pipelines:latest --push .