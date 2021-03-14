--CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE SCHEMA IF NOT EXISTS iot_data;
CREATE ROLE grafanadb LOGIN PASSWORD '${GRAFANA_DB_PASSWORD}';
CREATE SCHEMA IF NOT EXISTS AUTHORIZATION grafanadb;
CREATE SCHEMA IF NOT EXISTS iot_datasource;
CREATE USER grafana_datasource_user WITH PASSWORD '${GRAFANA_DATASOURCE_PASSWORD}';
GRANT CONNECT ON DATABASE iot_platform_db TO grafana_datasource_user;
GRANT USAGE ON SCHEMA iot_datasource TO grafana_datasource_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA iot_datasource GRANT SELECT ON TABLES TO grafana_datasource_user;

CREATE TABLE IF NOT EXISTS iot_data.thingData(
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  group_id varchar(42) NOT NULL,
  topic varchar(1024) NOT NULL,
  payload json NOT NULL,
  deleted  SMALLINT NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_thingdata_timestamp_topic ON iot_data.thingData(timestamp DESC, group_id, topic);

SELECT create_hypertable('iot_data.thingData', 'timestamp', chunk_time_interval => 86400000000, if_not_exists => TRUE);

CREATE VIEW iot_datasource.Table_IOT_Demos AS SELECT timestamp, topic, payload FROM iot_data.thingData WHERE group_id = 'Group_IOT_Demos';

INSERT INTO iot_data.thingData (group_id, topic, payload, timestamp, deleted)
VALUES ('Group_IOT_Demos','temperature', '{"temperature": "25.8"}', NOW(), 0);

INSERT INTO iot_data.thingData (group_id, topic, payload, timestamp, deleted)
VALUES ('Group_IOT_Demos','temperature', '{"temperature": "30.5"}', NOW(), 0);

