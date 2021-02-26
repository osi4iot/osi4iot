FROM grafana/grafana-image-renderer:latest
RUN apk --no-cache add curl
HEALTHCHECK --interval=10s --timeout=10s \
  CMD curl -f http://localhost:8081 || exit 1