FROM grafana/grafana:8.4.1-ubuntu
COPY grafana.ini /etc/grafana/grafana.ini
COPY data/default_datasource.yml /etc/grafana/provisioning/datasources/default.yml
COPY entry_script.sh /src/scripts/entry_script.sh
USER root
RUN chmod +x /src/scripts/entry_script.sh
RUN grafana-cli plugins install grafana-clock-panel
RUN grafana-cli plugins install natel-discrete-panel
RUN grafana-cli plugins install briangann-gauge-panel
RUN grafana-cli plugins install vonage-status-panel
RUN grafana-cli plugins install neocat-cal-heatmap-panel
USER grafana
HEALTHCHECK --interval=10s --timeout=300s --retries=30 \
  CMD curl -f localhost:5000/api/health || exit 1

ENTRYPOINT ["/src/scripts/entry_script.sh"]

