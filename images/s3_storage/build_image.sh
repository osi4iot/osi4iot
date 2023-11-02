docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/s3_storage:1.2.0 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/s3_storage:latest --push .