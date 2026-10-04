#!/bin/sh
set -eu
GARAGE_VERSION=v2.4.1
# Revision of the osi4iot image on top of that Garage version. Bump it
# whenever entrypoint.sh or garage-provision.sh change, together with
# DefaultGarageImage in the CLI (internals/utils/s3.go).
IMAGE_REVISION=2
docker buildx build --platform linux/amd64,linux/arm64 \
    --build-arg GARAGE_VERSION=${GARAGE_VERSION} \
    -t ghcr.io/osi4iot/garage:${GARAGE_VERSION}-${IMAGE_REVISION} \
    -t ghcr.io/osi4iot/garage:latest \
    --push .
