#!/bin/bash
echo "#########################################################################"
echo "#########        GENERATING DEBIAN NODE-RED DOCKER IMAGE        #########"
echo "#########################################################################"

docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/nodered_debian:latest --push .