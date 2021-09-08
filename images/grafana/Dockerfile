#FROM grafana/grafana
FROM grafana/grafana:8.1.2-ubuntu
COPY grafana.ini /etc/grafana/grafana.ini
COPY data/default_datasource.yml /etc/grafana/provisioning/datasources/default.yml
HEALTHCHECK --interval=10s --timeout=300s --retries=30 \
  CMD curl -f localhost:5000/api/health || exit 1

