package configs

import (
	"fmt"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

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
    inputs: ["host_node_state_parse"]
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

func CreateVectorConfig(
	pd *pt.PlatformData,
) pt.Config {
	vectorConfigHash := utils.GetMD5Hash(vectorConfig)
	vectorConfigName := fmt.Sprintf("vector_%s", vectorConfigHash)
	vectorConfig := pt.Config{
		Name: vectorConfigName,
		Data: vectorConfig,
	}

	return vectorConfig
}