docker buildx build --platform linux/amd64 -t ghcr.io/osi4iot/grafana_renderer:3.2.1 --push .
docker buildx build --platform linux/amd64 -t ghcr.io/osi4iot/grafana_renderer:latest --push .