docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/dev2pdb:1.2.0 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/dev2pdb:latest --push .