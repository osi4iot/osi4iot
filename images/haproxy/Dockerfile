FROM haproxy:2.8-alpine
 
USER root
RUN apk add --no-cache curl

USER haproxy

# 5000: Admin writes        5001: Admin reads       5002: Admin nats queries
# 5100: Metrics writes      5101: Metrics reads     5102: Metrics nats queries
# 7000: Stats dashboard
EXPOSE 5000 5001 5002 5100 5101 5102 7000