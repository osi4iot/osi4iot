#!/bin/sh
set -eu
GARAGE_WEBUI_VERSION=1.1.0
# Commit the tag must point to; the build fails if the tag was moved.
GARAGE_WEBUI_COMMIT=a6640157c1a757c92aa539149df0d902283e6763
docker buildx build --platform linux/amd64,linux/arm64 \
    --build-arg GARAGE_WEBUI_VERSION=${GARAGE_WEBUI_VERSION} \
    --build-arg GARAGE_WEBUI_COMMIT=${GARAGE_WEBUI_COMMIT} \
    -t ghcr.io/osi4iot/garage_webui:${GARAGE_WEBUI_VERSION} \
    -t ghcr.io/osi4iot/garage_webui:latest \
    --push .
