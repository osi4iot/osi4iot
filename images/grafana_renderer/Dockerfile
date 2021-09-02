FROM grafana/grafana-image-renderer:latest
USER root
RUN apk --no-cache add curl
USER grafana
HEALTHCHECK --interval=10s --timeout=10s \
  CMD curl -f http://localhost:8081 || exit 1