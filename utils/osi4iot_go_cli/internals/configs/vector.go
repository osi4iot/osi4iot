package configs

import (
	"fmt"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// The WAL archiver pipeline only exists when the platform runs on
// Patroni. Without it there is no patroni_sidecar to expose
// /archiver_status, no haproxy_patroni to route to a primary, and no
// observability.wal_archiver_metrics table to write into — that table
// is created by patroni_metrics' init_metrics.sql.template, which never
// runs in the legacy deployment.
//
// So the pipeline is spliced into the YAML at these three markers, or
// left out entirely. The markers are valid YAML comments on purpose: if
// a replacement ever fails to happen the config still parses, instead
// of Vector refusing to start.
const (
	walArchiverSourceMarker    = "  # @WAL_ARCHIVER_SOURCE@"
	walArchiverTransformMarker = "  # @WAL_ARCHIVER_TRANSFORM@"
	walArchiverSinksMarker     = "  # @WAL_ARCHIVER_SINKS@"
)

// walArchiverSource is spliced into `sources:`.
const walArchiverSource = `  # ---------------------------------------------------------------------------
  # WAL archiver health  →  observability.wal_archiver_metrics
  #
  # Answers "is WAL recycling blocked?", which volume_metrics only shows
  # indirectly and far too late. PostgreSQL cannot reuse a WAL segment
  # until it has been archived and no replication slot still needs it,
  # so when archive_command fails, pg_wal grows until the volume is full
  # and the database stops. There is no setting that prevents that —
  # discarding un-archived WAL would silently invalidate the backups.
  #
  # The gap between "archiving started failing" and "disk full" is hours
  # or days, and failed_count moves at the very start of it.
  #
  # One row per cluster: patroni_admin and patroni_metrics have separate
  # archives and fail independently, and metrics — which ingests
  # continuously — produces far more WAL and will usually break first.
  #
  # Emitted only by the Swarm leader, like host_state: vector runs
  # everywhere and three managers would otherwise write three identical
  # rows and collide on the primary key.
  #
  # Present only when the platform runs on Patroni — see
  # walArchiverEnabled.
  # ---------------------------------------------------------------------------
  wal_archiver_exec:
    type: exec
    mode: scheduled
    scheduled:
      exec_interval_secs: 60
    command: ["/usr/local/bin/system_metrics", "--collect", "wal_archiver"]`

// walArchiverTransform is spliced into `transforms:`.
const walArchiverTransform = `  # ---------------------------------------------------------------------------
  # WAL archiver pipeline
  #
  # Same shape as host_metrics_parse: the collector already emits exactly
  # the wal_archiver_metrics columns, so this only parses the line and
  # turns Go's RFC-3339 string into a native timestamp for TIMESTAMPTZ.
  #
  # drop_on_abort matters here more than elsewhere: the collector writes
  # nothing at all on non-leader nodes, and stderr diagnostics never
  # reach this input, so an empty line is the normal case on two of
  # three managers rather than an error.
  # ---------------------------------------------------------------------------
  wal_archiver_parse:
    type: remap
    inputs: ["wal_archiver_exec"]
    drop_on_abort: true
    source: |
      msg = strip_whitespace(string(.message) ?? "")
      if msg == "" { abort }

      parsed, err = parse_json(msg)
      if err != null { abort }

      . = parsed

      .time = parse_timestamp!(string(.time) ?? "", format: "%+")`

// walArchiverSinks is spliced into `sinks:`.
const walArchiverSinks = `  timescaledb_wal_archiver:
    type: postgres
    inputs: ["wal_archiver_parse"]
    endpoint: "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    table: "observability.wal_archiver_metrics"
    batch:
      max_events: 10
      timeout_secs: 15
    buffer:
      type: disk
      max_size: 268435488
      when_full: block
    request:
      retry_attempts: 5
      retry_initial_backoff_secs: 1
      retry_max_duration_secs: 30
    healthcheck:
      enabled: true

  nats_wal_archiver:
    type: nats
    inputs: ["wal_archiver_parse"]
    url: "${NATS_SEED_SERVERS_URL}"
    subject: "system.observability.wal_archiver_metrics"
    encoding:
      codec: json
    auth:
      strategy: nkey
      nkey:
        nkey: "${NATS_NKEY_PUB}"
        seed: "${NATS_NKEY_SEED}"
    tls:
      enabled: true
    buffer:
      type: disk
      max_size: 268435488
      when_full: block`

var vectorConfig = `
api:
  enabled: true
  address: "0.0.0.0:8686"

# =============================================================================
# SOURCES
# =============================================================================
sources:

  # ---------------------------------------------------------------------------
  # Logs
  # ---------------------------------------------------------------------------
  docker_logs:
    type: docker_logs
    docker_host: "unix:///var/run/docker.sock"
    exclude_containers:
      - "vector"

  # ---------------------------------------------------------------------------
  # Host node metrics  →  observability.host_metrics
  #
  # The Go binary collects everything the table needs in a single run:
  #   - CPU %   (two /proc/stat snapshots, 500 ms window)
  #   - load averages        (/proc/loadavg)
  #   - memory & swap        (/proc/meminfo)
  #   - root filesystem      (statfs on HOSTFS_ROOT)
  #   - network totals       (/proc/1/net/dev, physical interfaces only)
  #   - Docker container/image counts  (Docker API)
  #   - Swarm role, availability, labels  (Docker API → NodeInspect)
  #
  # This replaces the old Vector host_metrics source + Lua CPU-rate transform.
  # ---------------------------------------------------------------------------
  host_metrics_exec:
    type: exec
    mode: scheduled
    scheduled:
      exec_interval_secs: 15
    command: ["/usr/local/bin/system_metrics", "--collect", "host"]

  # ---------------------------------------------------------------------------
  # Container resource metrics  →  observability.container_metrics
  # ---------------------------------------------------------------------------
  container_metrics_exec:
    type: exec
    mode: scheduled
    scheduled:
      exec_interval_secs: 30
    command: ["/usr/local/bin/system_metrics", "--collect", "containers"]

  # ---------------------------------------------------------------------------
  # Per-container mount / volume metrics  →  observability.volume_metrics
  # ---------------------------------------------------------------------------
  volumes_metrics_exec:
    type: exec
    mode: scheduled
    scheduled:
      exec_interval_secs: 60
    command: ["/usr/local/bin/system_metrics", "--collect", "volumes"]

  # @WAL_ARCHIVER_SOURCE@

  # ---------------------------------------------------------------------------
  # Swarm node state  ->  observability.host_node_state
  #
  # Only manager nodes emit rows - collectHostState() exits cleanly with no
  # output on workers, so this source produces nothing there and the pipeline
  # stays silent.
  #
  # Interval longer than host_metrics: role/availability changes are
  # infrequent and the table is upserted, not appended.
  # ---------------------------------------------------------------------------
  host_state_exec:
    type: exec
    mode: scheduled
    scheduled:
      exec_interval_secs: 30
    command: ["/usr/local/bin/system_metrics", "--collect", "host_state"]


# =============================================================================
# TRANSFORMS
# =============================================================================
transforms:

  # ---------------------------------------------------------------------------
  # Logs pipeline
  # ---------------------------------------------------------------------------
  logs_enrich:
    type: remap
    inputs: ["docker_logs"]
    source: |
      .service = string(.label."com.docker.swarm.service.name") ?? .container_name

      task_name  = string(.label."com.docker.swarm.task.name") ?? ""
      task_parts = split(task_name, ".")
      .replica = if length(task_parts) >= 2 {
        to_int(task_parts[1]) ?? 0
      } else {
        0
      }

      .node  = get_env_var("HOSTNAME") ?? "unknown"
      .stack = string(.label."com.docker.stack.namespace") ?? "default"
      .time  = .timestamp

      del(.timestamp)
      del(.label)
      del(.container_created_at)
      del(.source_type)

  logs_parse:
    type: remap
    inputs: ["logs_enrich"]
    source: |
      parsed, err = parse_json(.message)

      if err == null && is_object(parsed) {
        level = get(parsed, ["level"]) ?? get(parsed, ["severity"]) ?? get(parsed, ["lvl"]) ?? "info"
        .level = downcase(string(level) ?? "info")

        trace_id = get(parsed, ["trace_id"]) ?? get(parsed, ["traceId"]) ?? get(parsed, ["trace-id"]) ?? null
        .trace_id = string(trace_id) ?? null

        msg = string(get(parsed, ["message"]) ?? get(parsed, ["msg"]) ?? get(parsed, ["text"]) ?? .message) ?? ""
        .message = if msg == "" { encode_json(parsed) } else { msg }

        del(parsed.level)
        del(parsed.severity)
        del(parsed.lvl)
        del(parsed.trace_id)
        del(parsed.traceId)
        del(parsed."trace-id")
        del(parsed.message)
        del(parsed.msg)
        del(parsed.text)
        del(parsed.timestamp)

        .metadata = parsed
      } else {
        .message = string(.message) ?? ""
        lower_msg = downcase(.message)
        .level = if contains(lower_msg, "error") || contains(lower_msg, "exception") || contains(lower_msg, "fatal") {
          "error"
        } else if contains(lower_msg, "warn") {
          "warn"
        } else if contains(lower_msg, "debug") {
          "debug"
        } else {
          "info"
        }
        .trace_id = null
        .metadata = {}
      }

  logs_filter_empty:
    type: filter
    inputs: ["logs_parse"]
    condition: |
      length(string(.message) ?? "") > 0

  logs_filter_debug:
    type: filter
    inputs: ["logs_filter_empty"]
    condition: |
      .level != "debug"

  # @WAL_ARCHIVER_TRANSFORM@

  # ---------------------------------------------------------------------------
  # Host metrics pipeline
  #
  # The binary emits one JSON object per run whose fields map directly to the
  # host_metrics table columns — no Lua, no delta computation, no field rename.
  # ---------------------------------------------------------------------------
  host_metrics_parse:
    type: remap
    inputs: ["host_metrics_exec"]
    drop_on_abort: true
    source: |
      msg = strip_whitespace(string(.message) ?? "")
      if msg == "" { abort }

      parsed, err = parse_json(msg)
      if err != null { abort }

      . = parsed

      # Convert the RFC-3339 string emitted by Go's time.Time.MarshalJSON()
      # to a native Vector timestamp for TIMESTAMPTZ insertion.
      .time = parse_timestamp!(string(.time) ?? "", format: "%+")

  # ---------------------------------------------------------------------------
  # Container metrics pipeline
  # ---------------------------------------------------------------------------
  container_metrics_parse:
    type: remap
    inputs: ["container_metrics_exec"]
    drop_on_abort: true
    source: |
      msg = strip_whitespace(string(.message) ?? "")
      if msg == "" { abort }

      parsed, err = parse_json(msg)
      if err != null { abort }

      . = parsed
      .time = parse_timestamp!(string(.time) ?? "", format: "%+")

  # ---------------------------------------------------------------------------
  # Container volumes pipeline
  # ---------------------------------------------------------------------------
  volume_metrics_parse:
    type: remap
    inputs: ["volumes_metrics_exec"]
    drop_on_abort: true
    source: |
      msg = strip_whitespace(string(.message) ?? "")
      if msg == "" { abort }

      parsed, err = parse_json(msg)
      if err != null { abort }

      . = parsed
      .time = parse_timestamp!(string(.time) ?? "", format: "%+")


  # ---------------------------------------------------------------------------
  # Swarm node state pipeline
  #
  # host_node_state has no time column — the table uses last_seen (DEFAULT NOW())
  # set by the upsert. We drop .time so Vector does not try to insert a column
  # that does not exist in the target table.
  # ---------------------------------------------------------------------------
  host_state_parse:
    type: remap
    inputs: ["host_state_exec"]
    drop_on_abort: true
    source: |
      msg = strip_whitespace(string(.message) ?? "")
      if msg == "" { abort }

      parsed, err = parse_json(msg)
      if err != null { abort }

      . = parsed
      # last_seen is a server-side DEFAULT NOW() — do not send it from the client
      # to avoid clock-skew issues between nodes.
      del(.last_seen)


# =============================================================================
# SINKS
# =============================================================================
sinks:

  timescaledb_logs:
    type: postgres
    inputs: ["logs_filter_debug"]
    endpoint: "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    table: "observability.log_entries"
    batch:
      max_events: 500
      timeout_secs: 5
    buffer:
      type: disk
      max_size: 268435488
      when_full: block
    request:
      retry_attempts: 5
      retry_initial_backoff_secs: 1
      retry_max_duration_secs: 30
    healthcheck:
      enabled: true

  nats_logs:
    type: nats
    inputs: ["logs_filter_debug"]
    url: "${NATS_SEED_SERVERS_URL}"
    subject: "system.observability.logs"
    encoding:
      codec: json
    auth:
      strategy: nkey
      nkey:
        nkey: "${NATS_NKEY_PUB}"
        seed: "${NATS_NKEY_SEED}"
    tls:
      enabled: true
    buffer:
      type: disk
      max_size: 268435488
      when_full: block

  # @WAL_ARCHIVER_SINKS@

  # Replaces the old timescaledb_host_metrics sink (observability.metrics).
  # The target is now the wide host_metrics table.
  timescaledb_host_metrics:
    type: postgres
    inputs: ["host_metrics_parse"]
    endpoint: "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    table: "observability.host_metrics"
    batch:
      max_events: 100
      timeout_secs: 15
    buffer:
      type: disk
      max_size: 268435488
      when_full: block
    request:
      retry_attempts: 5
      retry_initial_backoff_secs: 1
      retry_max_duration_secs: 30
    healthcheck:
      enabled: true

  nats_host_metrics:
    type: nats
    inputs: ["host_metrics_parse"]
    url: "${NATS_SEED_SERVERS_URL}"
    subject: "system.observability.host_metrics"
    encoding:
      codec: json
    auth:
      strategy: nkey
      nkey:
        nkey: "${NATS_NKEY_PUB}"
        seed: "${NATS_NKEY_SEED}"
    tls:
      enabled: true
    buffer:
      type: disk
      max_size: 268435488
      when_full: block

  timescaledb_container_metrics:
    type: postgres
    inputs: ["container_metrics_parse"]
    endpoint: "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    table: "observability.container_metrics"
    batch:
      max_events: 1000
      timeout_secs: 15
    buffer:
      type: disk
      max_size: 268435488
      when_full: block
    request:
      retry_attempts: 5
      retry_initial_backoff_secs: 1
      retry_max_duration_secs: 30
    healthcheck:
      enabled: true

  nats_container_metrics:
    type: nats
    inputs: ["container_metrics_parse"]
    url: "${NATS_SEED_SERVERS_URL}"
    subject: "system.observability.container_metrics"
    encoding:
      codec: json
    auth:
      strategy: nkey
      nkey:
        nkey: "${NATS_NKEY_PUB}"
        seed: "${NATS_NKEY_SEED}"
    tls:
      enabled: true
    buffer:
      type: disk
      max_size: 268435488
      when_full: block

  timescaledb_volume_metrics:
    type: postgres
    inputs: ["volume_metrics_parse"]
    endpoint: "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    table: "observability.volume_metrics"
    batch:
      max_events: 500
      timeout_secs: 30
    buffer:
      type: disk
      max_size: 268435488
      when_full: block
    request:
      retry_attempts: 5
      retry_initial_backoff_secs: 1
      retry_max_duration_secs: 30
    healthcheck:
      enabled: true

  nats_volume_metrics:
    type: nats
    inputs: ["volume_metrics_parse"]
    url: "${NATS_SEED_SERVERS_URL}"
    subject: "system.observability.volume_metrics"
    encoding:
      codec: json
    auth:
      strategy: nkey
      nkey:
        nkey: "${NATS_NKEY_PUB}"
        seed: "${NATS_NKEY_SEED}"
    tls:
      enabled: true
    buffer:
      type: disk
      max_size: 268435488
      when_full: block

  timescaledb_host_node_state:
    type: postgres
    inputs: ["host_state_parse"]
    endpoint: "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    table: "observability.host_node_state"
    batch:
      max_events: 50
      timeout_secs: 30
    buffer:
      type: disk
      max_size: 268435488
      when_full: block
    request:
      retry_attempts: 5
      retry_initial_backoff_secs: 1
      retry_max_duration_secs: 30
    healthcheck:
      enabled: true

  nats_host_node_state:
    type: nats
    inputs: ["host_state_parse"]
    url: "${NATS_SEED_SERVERS_URL}"
    subject: "system.observability.host_node_state"
    encoding:
      codec: json
    auth:
      strategy: nkey
      nkey:
        nkey: "${NATS_NKEY_PUB}"
        seed: "${NATS_NKEY_SEED}"
    tls:
      enabled: true
    buffer:
      type: disk
      max_size: 268435488
      when_full: block
`

// walArchiverEnabled is the single place that decides whether the WAL
// archiver pipeline exists.
//
// Today it is one field, but the condition is likely to grow — it may
// later have to require that wal-g is configured, or that backups are
// enabled at all. Keeping it in a function means the callers never
// change, and it is also where a type change in PlatformData
// (*bool, string) would be absorbed.
func walArchiverEnabled(pd *pt.PlatformData) bool {
	return pd != nil && pd.PlatformInfo.UsePatroniTool
}

// renderVectorConfig produces the final YAML for this platform.
//
// With Patroni off, leaving the exec source in place would have Vector
// run the collector every 60 seconds against a hostname that does not
// resolve, forever, and the sinks would target a table that was never
// created. Removing the three blocks removes the whole pipeline: no
// source, no input, nothing downstream.
func renderVectorConfig(pd *pt.PlatformData) string {
	source, transform, sinks := "", "", ""
	if walArchiverEnabled(pd) {
		source, transform, sinks = walArchiverSource, walArchiverTransform, walArchiverSinks
	}

	config := vectorConfig
	config = strings.Replace(config, walArchiverSourceMarker, source, 1)
	config = strings.Replace(config, walArchiverTransformMarker, transform, 1)
	config = strings.Replace(config, walArchiverSinksMarker, sinks, 1)

	return config
}

func CreateVectorConfig(
	pd *pt.PlatformData,
) pt.Config {
	// The hash must cover the RENDERED YAML, not the template. The two
	// modes produce different contents and must therefore produce
	// different config names: Swarm configs are immutable, so two
	// different bodies sharing a name would silently redeploy the old
	// object instead of failing.
	configData := renderVectorConfig(pd)

	vectorConfigHash := utils.GetMD5Hash(configData)
	vectorConfigName := fmt.Sprintf("vector_%s", vectorConfigHash)

	return pt.Config{
		Name: vectorConfigName,
		Data: configData,
	}
}