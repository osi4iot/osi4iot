#!/bin/bash

echo "################################## Run template_script"

if [ -f "/run/secrets/grafana.txt" ]
then
    export $(cat /run/secrets/grafana.txt | grep GRAFANA_ADMIN_PASSWORD)
    export $(cat /run/secrets/grafana.txt | grep NOTIFICATIONS_EMAIL_USER)
    export $(cat /run/secrets/grafana.txt | grep NOTIFICATIONS_EMAIL_PASSWORD)
    export $(cat /run/secrets/grafana.txt | grep NOTIFICATIONS_EMAIL_ADDRESS)
    export $(cat /run/secrets/grafana.txt | grep POSTGRES_DB)
    export $(cat /run/secrets/grafana.txt | grep GRAFANA_DB_PASSWORD)
    export $(cat /run/secrets/grafana.txt | grep TIMESCALE_DB)
    export $(cat /run/secrets/grafana.txt | grep GRAFANA_DATASOURCE_PASSWORD)
fi

if [ -f "/run/configs/grafana.conf" ]
then
    export GF_INSTALL_PLUGINS=grafana-clock-panel,natel-discrete-panel,briangann-gauge-panel,vonage-status-panel,neocat-cal-heatmap-panel
    export HOME_DASHBOARD_PATH=/var/lib/grafana/data/home_dashboard.json
    export GF_RENDERING_SERVER_URL=http://grafana_renderer:8081/render
    export GF_RENDERING_CALLBACK_URL=http://grafana:5000/grafana/
    export GF_LOG_FILTERS=rendering:debug
    MAIN_ORGANIZATION_ACRONYM_LINE=$(cat /run/configs/grafana.conf | grep MAIN_ORGANIZATION_ACRONYM)
    MAIN_ORGANIZATION_ACRONYM_LOWER_CASE=$(echo ${MAIN_ORGANIZATION_ACRONYM_LINE} | sed -e 's/^[^=]*=//' | sed -e 's/"//g' | sed -e 's/\(.*\)/\L\1/' | sed -e 's/\s/_/g')
    export MAIN_ORGANIZATION_DATASOURCE_NAME="iot_${MAIN_ORGANIZATION_ACRONYM_LOWER_CASE}_db"
    export $(cat /run/configs/grafana.conf | grep DOMAIN_NAME)
    export $(cat /run/configs/grafana.conf | grep DEFAULT_TIME_ZONE)
    MAIN_ORGANIZATION_NAME_LINE=$(cat /run/configs/grafana.conf | grep MAIN_ORGANIZATION_NAME)
    export MAIN_ORGANIZATION_NAME=$(echo $MAIN_ORGANIZATION_NAME_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
fi 

/run.sh