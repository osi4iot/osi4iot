#!/bin/bash
echo "#########################################################################"
echo "#########        GENERATING NODE-RED DEBIAN DOCKER IMAGE        #########"
echo "#########################################################################"

docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/nodered_debian:latest --push .