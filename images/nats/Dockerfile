FROM nats:2.11.1-alpine

RUN apk add --no-cache wget grep

HEALTHCHECK --interval=10s --timeout=60s --retries=3 \
  CMD wget -qO- http://localhost:8222/healthz | grep -q '"status":"ok"' || exit 1

ENTRYPOINT ["/usr/local/bin/nats-server"]