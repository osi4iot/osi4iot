FROM traefik:v2.10
HEALTHCHECK --interval=10s --timeout=1s --retries=3 \
    CMD wget --quiet --tries=1 --spider --no-check-certificate http://127.0.0.1:8080/ping || exit 1