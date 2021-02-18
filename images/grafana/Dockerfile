#FROM grafana/grafana
FROM grafana/grafana:latest-ubuntu
COPY grafana.ini /etc/grafana/grafana.ini
COPY data/default_datasource.yml /etc/grafana/provisioning/datasources/default.yml
COPY data/default_dashboard.yml /etc/grafana/provisioning/dashboards/default.yml
COPY data/default_notifier.yml /etc/grafana/provisioning/notifiers/default.yml