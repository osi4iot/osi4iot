FROM grafana/grafana:12.4.13-ubuntu

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

# Grafana 12 has no AngularJS: only React panel plugins load. Clock (>= 1.1),
# D3 Gauge (>= 2.0) and Status Panel (>= 2.0) are React in their latest
# versions. Discrete (natel-discrete-panel) and Cal-HeatMap
# (neocat-cal-heatmap-panel) are Angular only and are no longer installed:
# use the core "State timeline" and "Heatmap" panels instead.
# "grafana cli" (grafana-cli is gone in Grafana 13).
RUN grafana cli plugins install grafana-clock-panel \
    && grafana cli plugins install briangann-gauge-panel \
    && grafana cli plugins install vonage-status-panel

USER grafana

HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --retries=5 \
  CMD curl -f localhost:5000/api/health || exit 1

ENTRYPOINT ["/src/scripts/entry_script.sh"]

