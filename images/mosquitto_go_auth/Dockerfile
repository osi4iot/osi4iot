FROM iegomez/mosquitto-go-auth:latest-mosquitto_2.0.14
RUN apt install curl -y
HEALTHCHECK --interval=10s --timeout=5s --retries=6 \
  CMD (curl -f  http://localhost:8080 2>&1 | grep "Empty reply from server") || exit 1