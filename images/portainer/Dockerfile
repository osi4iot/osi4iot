FROM portainer/portainer-ce:2.6.3-alpine
RUN apk --no-cache add curl
HEALTHCHECK --interval=10s --timeout=10s --retries=6  --start-period=20s \
  CMD curl -f http://localhost:9000 || exit 1
