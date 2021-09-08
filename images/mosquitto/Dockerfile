FROM eclipse-mosquitto:2.0.12
HEALTHCHECK --interval=10s --timeout=10s --retries=6 \
  CMD timeout 5 mosquitto_sub -t '$SYS/#' -C 1 | grep -v Error || exit 1
