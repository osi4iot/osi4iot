--CREATE EXTENSION IF NOT EXISTS postgis;
REVOKE ALL ON SCHEMA public FROM public;

REVOKE ALL ON DATABASE iot_data_db FROM PUBLIC;

REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC;

REVOKE SELECT ON ALL TABLES IN SCHEMA information_schema FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS iot_data;

CREATE SCHEMA IF NOT EXISTS iot_datasource;

CREATE USER data_source_user_org_1
WITH
    PASSWORD '${GRAFANA_DATASOURCE_PASSWORD}';

GRANT CONNECT ON DATABASE iot_data_db TO data_source_user_org_1;

GRANT USAGE ON SCHEMA iot_datasource TO data_source_user_org_1;

CREATE TABLE IF NOT EXISTS iot_data.thingData (
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    group_uid varchar(42) NOT NULL,
    topic_uid varchar(42) NOT NULL,
    topic varchar(1024) NOT NULL,
    payload jsonb NOT NULL,
    deleted SMALLINT NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_thingdata_timestamp_topic ON iot_data.thingData (
    timestamp DESC,
    group_uid,
    topic
);

SELECT create_hypertable (
        'iot_data.thingData', 'timestamp', chunk_time_interval => INTERVAL '2 days', if_not_exists => TRUE
    );

SELECT add_retention_policy (
        'iot_data.thingData', INTERVAL '${DATA_RETENTION_INTERVAL}'
    );

CREATE TABLE IF NOT EXISTS iot_data.assetState (
    group_uid varchar(42) NOT NULL,
    asset_uid varchar(42) NOT NULL,
    state jsonb NOT NULL,
    last_updated TIMESTAMPTZ,
    CONSTRAINT assetstate_pkey PRIMARY KEY (group_uid, asset_uid)
);

-- =============================================================================
-- OBSERVABILITY
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS observability;

GRANT USAGE ON SCHEMA observability TO data_source_user_org_1;

-- =============================================================================
-- Logs and Metrics tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS observability.log_entries (
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    service TEXT NOT NULL DEFAULT 'unknown',
    replica INT NOT NULL DEFAULT 0,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT,
    node TEXT,
    stack TEXT,
    trace_id TEXT,
    metadata JSONB DEFAULT '{}'
);

SELECT create_hypertable (
        'observability.log_entries', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE
    );

GRANT
SELECT ON TABLE observability.log_entries TO data_source_user_org_1;

CREATE INDEX IF NOT EXISTS idx_log_service_time ON observability.log_entries (service, time DESC);

CREATE INDEX IF NOT EXISTS idx_log_level_time ON observability.log_entries (level, time DESC);

CREATE INDEX IF NOT EXISTS idx_log_trace_id ON observability.log_entries (trace_id)
WHERE
    trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_log_metadata ON observability.log_entries USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_log_message_fts ON observability.log_entries USING GIN (
    to_tsvector(
        'english',
        COALESCE(message, '')
    )
);

CREATE INDEX IF NOT EXISTS idx_log_message_trgm ON observability.log_entries USING GIN (message gin_trgm_ops);

ALTER TABLE observability.log_entries
SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'service, level',
        timescaledb.compress_orderby = 'time DESC'
    );

SELECT add_compression_policy (
        'observability.log_entries', compress_after => INTERVAL '1 days', if_not_exists => TRUE
    );

SELECT add_retention_policy (
        'observability.log_entries', drop_after => INTERVAL '7 days', if_not_exists => TRUE
    );

-- HOST METRICS: CPU, RAM, Network, etc. (collected from Vector)

CREATE TABLE IF NOT EXISTS observability.host_metrics (
    time TIMESTAMPTZ NOT NULL,

-- Identidad del host/nodo
node_id TEXT NOT NULL,
node_name TEXT NOT NULL,
hostname TEXT,
swarm_role TEXT, -- manager / worker
availability TEXT, -- active / drain / pause

-- CPU
cpu_cores INTEGER,
cpu_usage_percent DOUBLE PRECISION,
cpu_load1 DOUBLE PRECISION,
cpu_load5 DOUBLE PRECISION,
cpu_load15 DOUBLE PRECISION,

-- Memory
memory_total_bytes BIGINT,
memory_used_bytes BIGINT,
memory_available_bytes BIGINT,
memory_usage_percent DOUBLE PRECISION,

-- Swap
swap_total_bytes BIGINT, swap_used_bytes BIGINT,

-- Root disc / main filesystem principal
rootfs_total_bytes BIGINT,
rootfs_used_bytes BIGINT,
rootfs_available_bytes BIGINT,
rootfs_usage_percent DOUBLE PRECISION,

-- Network
network_rx_bytes_total BIGINT,
network_tx_bytes_total BIGINT,
network_rx_errors_total BIGINT,
network_tx_errors_total BIGINT,

-- Docker / Swarm
docker_containers_running INTEGER,
docker_containers_paused INTEGER,
docker_containers_stopped INTEGER,
docker_images_count INTEGER,

-- Metadata
labels JSONB, PRIMARY KEY (time, node_id) );

SELECT create_hypertable (
        'observability.host_metrics', 'time', if_not_exists => TRUE
    );

CREATE INDEX IF NOT EXISTS idx_host_metrics_node_time ON observability.host_metrics (node_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_host_metrics_node_name_time ON observability.host_metrics (node_name, time DESC);

ALTER TABLE observability.host_metrics
SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'node_id, node_name',
        timescaledb.compress_orderby = 'time DESC'
    );

SELECT add_compression_policy (
        'observability.host_metrics', compress_after => INTERVAL '1 days', if_not_exists => TRUE
    );

SELECT add_retention_policy (
        'observability.host_metrics', drop_after => INTERVAL '7 days', if_not_exists => TRUE
    );

GRANT
SELECT ON TABLE observability.host_metrics TO data_source_user_org_1;

-- CONTAINER METRICS: CPU, RAM, Network, etc. (collected from Vector)
CREATE TABLE IF NOT EXISTS observability.container_metrics (
    time TIMESTAMPTZ NOT NULL,

-- Identidad Docker / Swarm
container_id TEXT NOT NULL,
container_name TEXT,
image TEXT,
node_id TEXT NOT NULL,
node_name TEXT,
stack TEXT NOT NULL DEFAULT 'osi4iot',
service TEXT NOT NULL DEFAULT '',
task_id TEXT,
task_name TEXT,
replica_slot INTEGER,

-- Estado
state TEXT, -- running / exited / paused
status TEXT,
restart_count INTEGER,
pids INTEGER,

-- CPU
cpu_cores DOUBLE PRECISION, -- 0.25, 1.0, 2.5...
cpu_usage_percent DOUBLE PRECISION,
cpu_limit_cores DOUBLE PRECISION,
cpu_throttled_periods_total BIGINT,
cpu_throttled_time_nanoseconds_total BIGINT,

-- Memoria
memory_usage_bytes BIGINT,
memory_working_set_bytes BIGINT,
memory_limit_bytes BIGINT,
memory_cache_bytes BIGINT,
memory_rss_bytes BIGINT,
memory_usage_percent DOUBLE PRECISION,

-- Red agregada del contenedor
network_rx_bytes_total BIGINT,
network_tx_bytes_total BIGINT,
network_rx_packets_total BIGINT,
network_tx_packets_total BIGINT,
network_rx_errors_total BIGINT,
network_tx_errors_total BIGINT,

-- Block I/O

block_read_bytes_total BIGINT,
    block_write_bytes_total BIGINT,
    block_read_ops_total BIGINT,
    block_write_ops_total BIGINT,

    PRIMARY KEY (time, container_id)
);

SELECT create_hypertable (
        'observability.container_metrics', 'time', if_not_exists => TRUE
    );

CREATE INDEX IF NOT EXISTS idx_container_metrics_service_time ON observability.container_metrics (stack, service, time DESC);

CREATE INDEX IF NOT EXISTS idx_container_metrics_task_time ON observability.container_metrics (task_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_container_metrics_container_time ON observability.container_metrics (container_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_container_metrics_node_time ON observability.container_metrics (node_id, time DESC);

ALTER TABLE observability.container_metrics
SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'stack, service',
        timescaledb.compress_orderby = 'time DESC'
    );

SELECT add_compression_policy (
        'observability.container_metrics', compress_after => INTERVAL '1 days', if_not_exists => TRUE
    );

SELECT add_retention_policy (
        'observability.container_metrics', drop_after => INTERVAL '7 days', if_not_exists => TRUE
    );

GRANT
SELECT ON TABLE observability.container_metrics TO data_source_user_org_1;

--Volume Metrics: Disk usage of Docker volumes (collected from Vector)
CREATE TABLE IF NOT EXISTS observability.volume_metrics (
    time TIMESTAMPTZ NOT NULL,

-- Identidad Docker / Swarm
container_id TEXT NOT NULL,
container_name TEXT,
node_id TEXT NOT NULL,
node_name TEXT,
stack TEXT NOT NULL DEFAULT 'osi4iot',
service TEXT NOT NULL DEFAULT '',
task_id TEXT,
task_name TEXT,
replica_slot INTEGER,

-- Volumen / mount
volume_name TEXT,
mount_type TEXT, -- volume / bind / tmpfs / npipe
mount_source TEXT,
mount_destination TEXT NOT NULL,
driver TEXT, -- local / rexray / efs / etc.

-- Uso del volumen
used_bytes BIGINT,
available_bytes BIGINT,
total_bytes BIGINT,
usage_percent DOUBLE PRECISION,

-- Flags

read_only BOOLEAN,
    propagation TEXT,

    PRIMARY KEY (time, container_id, mount_destination)
);

SELECT create_hypertable (
        'observability.volume_metrics', 'time', if_not_exists => TRUE
    );

CREATE INDEX IF NOT EXISTS idx_volumes_service_time ON observability.volume_metrics (stack, service, time DESC);

CREATE INDEX IF NOT EXISTS idx_volumes_volume_time ON observability.volume_metrics (volume_name, time DESC);

CREATE INDEX IF NOT EXISTS idx_volumes_container_time ON observability.volume_metrics (container_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_volumes_node_time ON observability.volume_metrics (node_id, time DESC);

ALTER TABLE observability.volume_metrics
SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'stack, service',
        timescaledb.compress_orderby = 'time DESC'
    );

SELECT add_compression_policy (
        'observability.volume_metrics', compress_after => INTERVAL '1 days', if_not_exists => TRUE
    );

SELECT add_retention_policy (
        'observability.volume_metrics', drop_after => INTERVAL '7 days', if_not_exists => TRUE
    );

GRANT
SELECT ON TABLE observability.volume_metrics TO data_source_user_org_1;

-- =============================================================================
-- CONTINUOUS AGGREGATES — observability
-- =============================================================================
-- Requires TimescaleDB 2.x
-- Buckets:
--   host_metrics      → 1 minute
--   container_metrics → 1 minute
--   volume_metrics    → 5 minutes
--
-- Each view includes:
--   - Continuous aggregate policy (refresh every bucket interval)
--   - Compression policy          (compress_after > start_offset)
--   - Retention policy            (drop after 7 days)
--   - GRANT SELECT                to data_source_user_org_1
-- =============================================================================

-- =============================================================================
-- 1. HOST METRICS — 1 minute
-- =============================================================================

CREATE MATERIALIZED VIEW observability.host_metrics_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket ('1 minute', time) AS bucket,
    node_id,
    node_name,

-- Identity (static values within the bucket)
last (hostname, time) AS hostname,
last (swarm_role, time) AS swarm_role,
last (availability, time) AS availability,

-- CPU
last (cpu_cores, time) AS cpu_cores,
avg(cpu_usage_percent) AS cpu_usage_percent_avg,
max(cpu_usage_percent) AS cpu_usage_percent_max,
avg(cpu_load1) AS cpu_load1_avg,
avg(cpu_load5) AS cpu_load5_avg,
avg(cpu_load15) AS cpu_load15_avg,

-- Memory
last (memory_total_bytes, time) AS memory_total_bytes,
avg(memory_used_bytes) AS memory_used_bytes_avg,
max(memory_used_bytes) AS memory_used_bytes_max,
avg(memory_available_bytes) AS memory_available_bytes_avg,
avg(memory_usage_percent) AS memory_usage_percent_avg,
max(memory_usage_percent) AS memory_usage_percent_max,

-- Swap
last (swap_total_bytes, time) AS swap_total_bytes,
avg(swap_used_bytes) AS swap_used_bytes_avg,
max(swap_used_bytes) AS swap_used_bytes_max,

-- Root filesystem
last (rootfs_total_bytes, time) AS rootfs_total_bytes,
avg(rootfs_used_bytes) AS rootfs_used_bytes_avg,
avg(rootfs_available_bytes) AS rootfs_available_bytes_avg,
avg(rootfs_usage_percent) AS rootfs_usage_percent_avg,
max(rootfs_usage_percent) AS rootfs_usage_percent_max,

-- Network (cumulative counters — use last() to preserve the latest value in the bucket)
last (network_rx_bytes_total, time) AS network_rx_bytes_total,
last (network_tx_bytes_total, time) AS network_tx_bytes_total,
last (network_rx_errors_total, time) AS network_rx_errors_total,
last (network_tx_errors_total, time) AS network_tx_errors_total,

-- Docker / Swarm
avg(docker_containers_running) AS docker_containers_running_avg,
max(docker_containers_running) AS docker_containers_running_max,
last (
    docker_containers_paused,
    time
) AS docker_containers_paused,
last (
    docker_containers_stopped,
    time
) AS docker_containers_stopped,
last (docker_images_count, time) AS docker_images_count
FROM observability.host_metrics
GROUP BY
    bucket,
    node_id,
    node_name
WITH
    NO DATA;

-- Real-time data is included for the non-yet-materialized tail period
ALTER MATERIALIZED VIEW observability.host_metrics_1m
SET (
        timescaledb.materialized_only = false
    );

-- Refresh every minute; keep a 10-minute look-back window to handle late data
SELECT
    add_continuous_aggregate_policy (
        'observability.host_metrics_1m',
        start_offset => INTERVAL '10 minutes',
        end_offset => INTERVAL '1 minute',
        schedule_interval => INTERVAL '1 minute',
        if_not_exists => TRUE
    );

-- Compress chunks older than 1 hour (must be > start_offset to avoid conflicts with the refresh policy)
ALTER MATERIALIZED VIEW observability.host_metrics_1m
SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'node_id, node_name',
        timescaledb.compress_orderby = 'bucket DESC'
    );

SELECT add_compression_policy (
        'observability.host_metrics_1m', compress_after => INTERVAL '1 hour', if_not_exists => TRUE
    );

-- Drop chunks older than 7 days
SELECT add_retention_policy (
        'observability.host_metrics_1m', drop_after => INTERVAL '7 days', if_not_exists => TRUE
    );

GRANT
SELECT ON observability.host_metrics_1m TO data_source_user_org_1;

-- =============================================================================
-- 2. CONTAINER METRICS — 1 minute
-- =============================================================================

CREATE MATERIALIZED VIEW observability.container_metrics_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket ('1 minute', time) AS bucket,
    container_id,

-- Docker / Swarm identity (static values within the bucket)
last (container_name, time) AS container_name,
last (image, time) AS image,
last (node_id, time) AS node_id,
last (node_name, time) AS node_name,
last (stack, time) AS stack,
last (service, time) AS service,
last (task_id, time) AS task_id,
last (task_name, time) AS task_name,
last (replica_slot, time) AS replica_slot,

-- State
last (state, time) AS state,
last (status, time) AS status,
max(restart_count) AS restart_count_max,
avg(pids) AS pids_avg,
max(pids) AS pids_max,

-- CPU
last (cpu_cores, time) AS cpu_cores,
avg(cpu_usage_percent) AS cpu_usage_percent_avg,
max(cpu_usage_percent) AS cpu_usage_percent_max,
last (cpu_limit_cores, time) AS cpu_limit_cores,
last (
    cpu_throttled_periods_total,
    time
) AS cpu_throttled_periods_total,
last (
    cpu_throttled_time_nanoseconds_total,
    time
) AS cpu_throttled_time_nanoseconds_total,

-- Memory
avg(memory_usage_bytes) AS memory_usage_bytes_avg,
max(memory_usage_bytes) AS memory_usage_bytes_max,
avg(memory_working_set_bytes) AS memory_working_set_bytes_avg,
max(memory_working_set_bytes) AS memory_working_set_bytes_max,
last (memory_limit_bytes, time) AS memory_limit_bytes,
avg(memory_cache_bytes) AS memory_cache_bytes_avg,
avg(memory_rss_bytes) AS memory_rss_bytes_avg,
avg(memory_usage_percent) AS memory_usage_percent_avg,
max(memory_usage_percent) AS memory_usage_percent_max,

-- Network (cumulative counters — use last() to preserve the latest value in the bucket)
last (network_rx_bytes_total, time) AS network_rx_bytes_total,
last (network_tx_bytes_total, time) AS network_tx_bytes_total,
last (
    network_rx_packets_total,
    time
) AS network_rx_packets_total,
last (
    network_tx_packets_total,
    time
) AS network_tx_packets_total,
last (network_rx_errors_total, time) AS network_rx_errors_total,
last (network_tx_errors_total, time) AS network_tx_errors_total,

-- Block I/O (cumulative counters — use last() to preserve the latest value in the bucket)
last (block_read_bytes_total, time) AS block_read_bytes_total,
last (block_write_bytes_total, time) AS block_write_bytes_total,
last (block_read_ops_total, time) AS block_read_ops_total,
last (block_write_ops_total, time) AS block_write_ops_total
FROM observability.container_metrics
GROUP BY
    bucket,
    container_id
WITH
    NO DATA;

-- Real-time data is included for the non-yet-materialized tail period
ALTER MATERIALIZED VIEW observability.container_metrics_1m
SET (
        timescaledb.materialized_only = false
    );

-- Refresh every minute; keep a 10-minute look-back window to handle late data
SELECT
    add_continuous_aggregate_policy (
        'observability.container_metrics_1m',
        start_offset => INTERVAL '10 minutes',
        end_offset => INTERVAL '1 minute',
        schedule_interval => INTERVAL '1 minute',
        if_not_exists => TRUE
    );

-- Compress chunks older than 1 hour (must be > start_offset to avoid conflicts with the refresh policy)
-- node_name is nullable in the source table; use container_id as the sole segment key for reliable compression
ALTER MATERIALIZED VIEW observability.container_metrics_1m
SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'container_id',
        timescaledb.compress_orderby = 'bucket DESC'
    );

SELECT add_compression_policy (
        'observability.container_metrics_1m', compress_after => INTERVAL '1 hour', if_not_exists => TRUE
    );

-- Drop chunks older than 7 days
SELECT add_retention_policy (
        'observability.container_metrics_1m', drop_after => INTERVAL '7 days', if_not_exists => TRUE
    );

GRANT
SELECT ON observability.container_metrics_1m TO data_source_user_org_1;

-- =============================================================================
-- 3. VOLUME METRICS — 5 minutes
-- =============================================================================

CREATE MATERIALIZED VIEW observability.volume_metrics_5m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket ('5 minutes', time) AS bucket,
    container_id,
    mount_destination,

-- Identity (static values within the bucket)
last (container_name, time) AS container_name,
last (node_id, time) AS node_id,
last (node_name, time) AS node_name,
last (stack, time) AS stack,
last (service, time) AS service,
last (task_id, time) AS task_id,
last (task_name, time) AS task_name,
last (replica_slot, time) AS replica_slot,

-- Volume / mount metadata (static within the bucket)
last (volume_name, time) AS volume_name,
last (mount_type, time) AS mount_type,
last (mount_source, time) AS mount_source,
last (driver, time) AS driver,
last (read_only, time) AS read_only,
last (propagation, time) AS propagation,

-- Volume usage
avg(used_bytes) AS used_bytes_avg,
max(used_bytes) AS used_bytes_max,
avg(available_bytes) AS available_bytes_avg,
min(available_bytes) AS available_bytes_min,
last (total_bytes, time) AS total_bytes,
avg(usage_percent) AS usage_percent_avg,
max(usage_percent) AS usage_percent_max
FROM observability.volume_metrics
GROUP BY
    bucket,
    container_id,
    mount_destination
WITH
    NO DATA;

-- Real-time data is included for the non-yet-materialized tail period
ALTER MATERIALIZED VIEW observability.volume_metrics_5m
SET (
        timescaledb.materialized_only = false
    );

-- Refresh every 5 minutes; keep a 30-minute look-back window to handle late data
SELECT
    add_continuous_aggregate_policy (
        'observability.volume_metrics_5m',
        start_offset => INTERVAL '30 minutes',
        end_offset => INTERVAL '5 minutes',
        schedule_interval => INTERVAL '5 minutes',
        if_not_exists => TRUE
    );

-- Compress chunks older than 2 hours (must be > start_offset to avoid conflicts with the refresh policy)
-- node_name is nullable in the source table; use container_id + mount_destination as segment keys
ALTER MATERIALIZED VIEW observability.volume_metrics_5m
SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'container_id, mount_destination',
        timescaledb.compress_orderby = 'bucket DESC'
    );

SELECT add_compression_policy (
        'observability.volume_metrics_5m', compress_after => INTERVAL '2 hours', if_not_exists => TRUE
    );

-- Drop chunks older than 7 days
SELECT add_retention_policy (
        'observability.volume_metrics_5m', drop_after => INTERVAL '7 days', if_not_exists => TRUE
    );

GRANT
SELECT ON observability.volume_metrics_5m TO data_source_user_org_1;