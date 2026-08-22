FROM grafana/grafana:8.4.1-ubuntu

# gettext-base provides envsubst, used in entry_script.sh to resolve
# ${POSTGRES_HOST}, ${POSTGRES_PORT} and other vars in grafana.ini.
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends gettext-base \
    && rm -rf /var/lib/apt/lists/*

COPY grafana.ini /etc/grafana/grafana.ini
COPY data/default_datasource.yml /etc/grafana/provisioning/datasources/default.yml
COPY entry_script.sh /src/scripts/entry_script.sh

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

