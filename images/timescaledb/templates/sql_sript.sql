--CREATE EXTENSION IF NOT EXISTS postgis;
REVOKE ALL ON SCHEMA public FROM public;
REVOKE ALL ON DATABASE iot_data_db FROM PUBLIC;
REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC;
REVOKE SELECT ON ALL TABLES IN SCHEMA information_schema FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE SCHEMA IF NOT EXISTS iot_data;
CREATE SCHEMA IF NOT EXISTS iot_datasource;
CREATE USER data_source_user_org_1 WITH PASSWORD '${GRAFANA_DATASOURCE_PASSWORD}';
GRANT CONNECT ON DATABASE iot_data_db TO data_source_user_org_1;
GRANT USAGE ON SCHEMA iot_datasource TO data_source_user_org_1;

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
SELECT add_retention_policy('iot_data.thingData', INTERVAL '${DATA_RETENTION_INTERVAL}');

CREATE TABLE IF NOT EXISTS iot_data.assetsState(
  group_uid varchar(42) NOT NULL,
  device_uid varchar(42) NOT NULL,
  asset_uid varchar(42) NOT NULL,
  current_state json NOT NULL,
  last_updated TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS IDX_assets_state_group_asset ON iot_data.assetsState(group_uid, asset_uid);