FROM iegomez/mosquitto-go-auth:latest-mosquitto_2.0.14
RUN apt install curl -y
HEALTHCHECK --interval=10s --timeout=10s --retries=6 \
  CMD curl -f http://localhost:8080  || exit 1