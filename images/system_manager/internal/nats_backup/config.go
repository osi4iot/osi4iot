// Package nats_backup implements two system_manager tasks — Backup and
// Restore — that together replace the platform CLI's old habit of
// snapshotting NATS JetStream streams to a local directory on the
// manager host (~/.osi4iot/nats_backups) for its manual
// `osi4iot streams backup` command. Backup now runs on its own daily
// schedule (like patroni_admin/patroni_metrics — see
// internal/patroni_backup) AND on demand over NATS, and uploads
// straight to S3 instead of local disk. Restore pulls the most recent
// run back down on demand.
//
// Unlike Postgres backups, there is no sidecar running inside the NATS
// containers with its own local S3/WAL-G credentials (see nats/Dockerfile
// — the nats-server image is unmodified upstream, no patroni_sidecar
// equivalent lives alongside it). So this package does the JetStream
// snapshot AND the S3 upload/download itself, directly (see runs.go and
// internal/s3store) — which is why system_manager's entrypoint.sh
// requires AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION
// unconditionally even though internal/patroni_backup's Postgres path
// needs none of its own (it delegates to patroni_sidecar, which has its
// own WAL-G credentials).
//
// Both tasks reuse the SAME S3 bucket WALG_S3_PREFIX already points
// patroni_admin/patroni_metrics at, under their own prefix
// (NATS_BACKUP_S3_PREFIX) — one bucket, three prefixes, the same
// AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION already required.
//
// NATS connectivity goes through internal/natsconn — the same shared
// NKey identity (NATS_NKEY_SEED) natssvc registers its own request-reply
// service with. See natsconn's package doc comment for what that
// identity needs to be granted.
//
// Restore is on-demand only (does not implement task.Scheduled), and —
// like patroni.SwitchoverToNode1/ResetNode1Raft — deliberately NOT
// parameterized: it always restores the MOST RECENT run, deleting any
// existing same-named streams first, at the cluster's current replica
// count. task.Task's Run(ctx) (string, error) signature, shared by
// every task in this service, has no room for a per-request parameter
// (which run, which replica count, whether to delete first) without
// widening it for every other task too. If a genuine need for
// "restore a specific older run" or "restore without deleting" shows up
// later, that's a reason to add a second, explicitly-parameterized task
// type — not to loosen this one. See
// system_manager/internal/patroni/patroni.go's SwitchoverToNode1 doc
// comment for the fuller reasoning behind that convention.
package nats_backup

import (
	"fmt"
	"strings"

	"system_manager/internal/config"
	"system_manager/internal/natsconn"
)

// Config holds everything Backup and Restore need: how to reach NATS,
// and where in S3 to read/write snapshots.
type Config struct {
	nats natsconn.Config

	// S3 destination, in the same "s3://bucket/prefix" shape
	// WALG_S3_PREFIX already uses for patroni_admin/patroni_metrics (see
	// their entrypoint.sh) — same bucket, different prefix.
	s3Bucket string
	s3Prefix string // may be "", meaning runs live at the bucket root

	// s3Endpoint/s3ForcePathStyle are for MinIO deployments — the same
	// AWS_ENDPOINT/AWS_S3_FORCE_PATH_STYLE pair patroni_admin/
	// patroni_metrics' Dockerfile already sets for wal-g. Unset
	// (s3Endpoint == "") means talk to real AWS S3.
	s3Endpoint       string
	s3ForcePathStyle bool
	awsRegion        string

	// awsAccessKeyID/awsSecretAccessKey are captured HERE, once, at
	// process startup — not left for s3store to rediscover from the
	// environment later. See s3store.Config's doc comment: certrenewer
	// permanently overwrites these same env vars with Route53's
	// credentials the first time it runs, anywhere in this process's
	// lifetime. Reading them now, before that can happen (LoadConfig
	// runs synchronously in main.go before any task's Run is invoked),
	// is what makes nats_backup immune to that regardless of scheduling
	// order.
	awsAccessKeyID     string
	awsSecretAccessKey string

	backupHour int // UTC hour of day Backup's schedule starts at
	everyHours int // Backup repeats every this many hours after backupHour; 24 (once a day) if unset — see schedule.EveryNHoursAt
	retain     int // number of timestamped runs to keep in S3
}

// LoadConfig reads the NATS backup/restore configuration from the
// environment. Aborts the process (via config.MustEnv) if a required
// variable is missing — entrypoint.sh checks the same list before this
// process ever starts.
func LoadConfig() Config {
	bucket, prefix, err := parseS3URI(config.MustEnv("NATS_BACKUP_S3_PREFIX"))
	if err != nil {
		// MustEnv already aborts the process on a missing/empty var; a
		// malformed (present but unparseable) value warrants the same
		// hard stop for the same reason — this is a misconfigured
		// deployment, not a runtime condition to recover from.
		panic(fmt.Sprintf("invalid NATS_BACKUP_S3_PREFIX: %v", err))
	}

	// AWS_ENDPOINT / AWS_S3_FORCE_PATH_STYLE, not something
	// nats_backup-specific: this is the SAME pair patroni_admin/
	// patroni_metrics' own Dockerfile already sets for wal-g's MinIO
	// support (default AWS_ENDPOINT="", AWS_S3_FORCE_PATH_STYLE="true").
	// Reusing those exact names means a platform that already has MinIO
	// working for Postgres backups gets it for NATS backups for free,
	// with nothing new to provision — an nats_backup-only variable name
	// here would silently never be set on an existing deployment and
	// fail over to real AWS S3 with MinIO-only credentials, which is
	// exactly what happened before this comment was written.
	endpoint := config.EnvStringDefault("AWS_ENDPOINT", "")
	forcePathStyle := config.EnvStringDefault("AWS_S3_FORCE_PATH_STYLE", "true") == "true"

	return Config{
		nats: natsconn.LoadConfig(),

		s3Bucket:         bucket,
		s3Prefix:         prefix,
		s3Endpoint:       endpoint,
		s3ForcePathStyle: endpoint != "" && forcePathStyle,
		awsRegion:        config.MustEnv("AWS_REGION"),

		awsAccessKeyID:     config.MustEnv("AWS_ACCESS_KEY_ID"),
		awsSecretAccessKey: config.MustEnv("AWS_SECRET_ACCESS_KEY"),

		// Default hour moved to 0 (from 5) now that taskpool.Pool bounds
		// how many tasks can actually run at once — clustering most
		// periodic tasks near midnight no longer risks them all
		// hammering S3/wal-g/NATS unbounded and simultaneously. Override
		// with SYSTEM_MANAGER_BACKUP_HOUR_NATS if a deployment wants
		// this one spread out from the others instead.
		backupHour: config.EnvIntDefault("SYSTEM_MANAGER_BACKUP_HOUR_NATS", 0),
		// everyHours=24 (once a day) unless a deployment wants NATS
		// backups more often than the others — see schedule.EveryNHoursAt
		// for the exact semantics, including the drift caveat for values
		// that don't evenly divide 24.
		everyHours: config.EnvIntDefault("SYSTEM_MANAGER_BACKUP_EVERY_HOURS_NATS", 24),
		retain:     config.EnvIntDefault("SYSTEM_MANAGER_RETAIN_NATS", 7),
	}
}

// parseS3URI splits "s3://bucket/prefix/like/this" into its bucket and
// prefix. A bare "s3://bucket" (no trailing path) is valid and yields an
// empty prefix.
func parseS3URI(uri string) (bucket, prefix string, err error) {
	const schema = "s3://"
	if !strings.HasPrefix(uri, schema) {
		return "", "", fmt.Errorf("expected an s3:// URI, got %q", uri)
	}
	rest := strings.TrimPrefix(uri, schema)
	if rest == "" {
		return "", "", fmt.Errorf("s3:// URI has no bucket: %q", uri)
	}
	parts := strings.SplitN(rest, "/", 2)
	bucket = parts[0]
	if bucket == "" {
		return "", "", fmt.Errorf("s3:// URI has no bucket: %q", uri)
	}
	if len(parts) == 2 {
		prefix = strings.Trim(parts[1], "/")
	}
	return bucket, prefix, nil
}
