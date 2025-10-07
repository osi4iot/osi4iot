FROM grafana/grafana:12.3.0-17718666199-ubuntu
COPY grafana.ini /etc/grafana/grafana.ini
COPY data/default_datasource.yml /etc/grafana/provisioning/datasources/default.yml
COPY entry_script.sh /src/scripts/entry_script.sh
USER root
RUN chmod +x /src/scripts/entry_script.sh
RUN grafana cli plugins install grafana-clock-panel \
 && grafana cli plugins install briangann-gauge-panel \
 && grafana cli plugins install vonage-status-panel
RUN grafana cli plugins install natel-discrete-panel || true
RUN grafana cli plugins install neocat-cal-heatmap-panel || true
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS="natel-discrete-panel,neocat-cal-heatmap-panel"
# RUN chown -R grafana:grafana /var/lib/grafana /etc/grafana /usr/share/grafana
USER grafana
HEALTHCHECK --interval=10s --timeout=300s --retries=30 \
  CMD curl -f localhost:5000/api/health || exit 1

ENTRYPOINT ["/src/scripts/entry_script.sh"]

