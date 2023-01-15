FROM grafana/grafana-image-renderer:3.2.1
USER root
RUN apk add --no-cache tzdata
RUN apk --no-cache add curl
USER grafana
HEALTHCHECK --interval=10s --timeout=10s \
  CMD curl -f http://localhost:8081 || exit 1