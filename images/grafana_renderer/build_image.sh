docker buildx build --platform linux/amd64 -t ghcr.io/osi4iot/grafana_renderer:1.1.0 --push .
docker buildx build --platform linux/amd64 -t ghcr.io/osi4iot/grafana_renderer:latest --push .