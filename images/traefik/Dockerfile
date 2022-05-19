FROM traefik:v2.7
COPY certs-traefik.yml /etc/traefik/dynamic/certs-traefik.yaml
HEALTHCHECK --interval=10s --timeout=1s --retries=3 \
    CMD wget --quiet --tries=1 --spider --no-check-certificate http://127.0.0.1:8080/ping || exit 1