FROM dpage/pgadmin4
USER root
RUN apk --no-cache add curl
HEALTHCHECK --interval=10s --timeout=3s \
  CMD curl -f http://localhost || exit 1
USER pgadmin