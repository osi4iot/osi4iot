--CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE SCHEMA IF NOT EXISTS iot_data;
CREATE SCHEMA IF NOT EXISTS iot_datasource;
CREATE USER grafana_datasource_user WITH PASSWORD '${GRAFANA_DATASOURCE_PASSWORD}';
GRANT CONNECT ON DATABASE iot_data_db TO grafana_datasource_user;
GRANT USAGE ON SCHEMA iot_datasource TO grafana_datasource_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA iot_datasource GRANT SELECT ON TABLES TO grafana_datasource_user;

CREATE TABLE IF NOT EXISTS iot_data.thingData(
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  group_uid varchar(42) NOT NULL,
  device_uid varchar(42) NOT NULL,
  topic_uid varchar(42) NOT NULL,
  topic varchar(1024) NOT NULL,
  payload json NOT NULL,
  deleted  SMALLINT NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_thingdata_timestamp_topic ON iot_data.thingData(timestamp DESC, group_uid, topic);
SELECT create_hypertable('iot_data.thingData', 'timestamp', chunk_time_interval => 86400000000, if_not_exists => TRUE);
SELECT add_retention_policy('iot_data.thingData', INTERVAL '15 minutes');


