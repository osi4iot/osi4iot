// Package statefile stores and retrieves encrypted copies of the
// platform CLI's osi4iot_state.json in S3, as three on-demand tasks:
// Backup, Restore and List.
//
// The state file is the single most valuable artefact the platform has.
// It holds every credential the deployment uses — Postgres and
// TimescaleDB superuser passwords, the NATS issuer seed, SSH keys, the
// ACME account key, the domain's TLS private key — and it lives on ONE
// operator's laptop. Losing it means losing the ability to manage,
// update or scale the platform at all. Backing it up somewhere durable
// is worth doing on its own; doing it automatically, on every change,
// is what makes it actually happen.
//
// # This service never sees the contents
//
// The blob arrives already encrypted, from the CLI, and leaves the same
// way. system_manager is a pipe to S3 and nothing more: it cannot read
// what it stores, and a compromise of this service (or of the bucket)
// yields ciphertext under a key that only ever exists in the CLI's own
// state file. That property is free — the CLI has to encrypt anyway —
// and it is the reason Backup takes the blob as a request parameter
// rather than this package going and fetching a file it has no business
// being able to read.
//
// # Runs are timestamped, never overwritten
//
// Each backup is its own object, named for the moment it was taken, and
// old ones are pruned to the newest `retain`. A single fixed key would
// mean a bad state file — truncated, from the wrong platform, encrypted
// with a rotated key — silently destroying the last good copy the
// moment it was uploaded. With automatic backups firing on every write,
// that stops being a hypothetical.
//
// # What this cannot do on its own
//
// Restore over NATS presupposes a working state file: the CLI needs it
// for the NATS credentials to make the request, and for the key to
// decrypt the reply. So this covers "my state file is stale, corrupt,
// or from another machine" — NOT "my laptop is gone". For the second
// one, the operator needs the bucket coordinates and the state-file
// subkey held somewhere outside the state file, and a restore path that
// talks to S3 directly. See the CLI's `osi4iot state` commands.
package statefile

import (
	"context"
	"fmt"
	"os"
	"path"
	"sort"
	"strings"
	"time"

	"system_manager/internal/config"
	"system_manager/internal/s3store"
)

// runSuffix is the extension every stored run carries. Objects that
// don't end in it are ignored when listing, so an unrelated file that
// finds its way under the prefix can't be mistaken for a backup.
const runSuffix = ".enc"

// runTimeFormat names objects by the instant they were taken, in UTC.
// Chosen so that lexicographic order equals chronological order — that
// is what lets List sort raw S3 keys without parsing every one of them,
// and what makes "keep the newest N" a matter of slicing a sorted list.
const runTimeFormat = "20060102T150405Z"

// Config holds where in S3 the runs live and how many to keep.
type Config struct {
	s3Bucket string
	s3Prefix string

	s3Endpoint       string
	s3ForcePathStyle bool
	awsRegion        string

	// awsAccessKeyID/awsSecretAccessKey are captured at startup, not
	// read from the environment when a task runs. certrenewer
	// permanently overwrites those same env vars with Route53's
	// credentials the first time it renews, so anything re-reading them
	// later in this process's life authenticates as the wrong identity.
	// See s3store.Config's doc comment for the full story.
	awsAccessKeyID     string
	awsSecretAccessKey string

	retain int
}

// LoadConfig reads the state-file backup configuration from the
// environment. Aborts the process (via config.MustEnv) if a required
// variable is missing — entrypoint.sh checks the same list first.
func LoadConfig() Config {
	bucket, prefix, err := parseS3URI(config.MustEnv("STATE_FILE_S3_PREFIX"))
	if err != nil {
		panic(fmt.Sprintf("invalid STATE_FILE_S3_PREFIX: %v", err))
	}

	// The same AWS_ENDPOINT/AWS_S3_FORCE_PATH_STYLE pair wal-g and
	// nats_backup already use for MinIO — a platform with MinIO working
	// for Postgres backups gets it here for free.
	endpoint := config.EnvStringDefault("AWS_ENDPOINT", "")
	forcePathStyle := config.EnvStringDefault("AWS_S3_FORCE_PATH_STYLE", "true") == "true"

	return Config{
		s3Bucket:         bucket,
		s3Prefix:         prefix,
		s3Endpoint:       endpoint,
		s3ForcePathStyle: endpoint != "" && forcePathStyle,
		awsRegion:        config.MustEnv("AWS_REGION"),

		awsAccessKeyID:     config.MustEnv("AWS_ACCESS_KEY_ID"),
		awsSecretAccessKey: config.MustEnv("AWS_SECRET_ACCESS_KEY"),

		// 30 rather than nats_backup's 7: these objects are a few KB
		// each, backups fire on every state change rather than once a
		// day, and the thing they protect against — a bad state file
		// overwriting a good one — is better served by a deep history
		// than a shallow one.
		retain: config.EnvIntDefault("SYSTEM_MANAGER_RETAIN_STATE_FILE", 30),
	}
}

func (c Config) client(ctx context.Context) (*s3store.Client, error) {
	return s3store.New(ctx, s3store.Config{
		Bucket:          c.s3Bucket,
		Prefix:          c.s3Prefix,
		Region:          c.awsRegion,
		AccessKeyID:     c.awsAccessKeyID,
		SecretAccessKey: c.awsSecretAccessKey,
		Endpoint:        c.s3Endpoint,
		ForcePathStyle:  c.s3ForcePathStyle,
	})
}

// listRuns returns every stored run's object key, newest first.
func listRuns(ctx context.Context, cli *s3store.Client) ([]string, error) {
	keys, err := cli.ListObjects(ctx, "")
	if err != nil {
		return nil, err
	}

	runs := make([]string, 0, len(keys))
	for _, k := range keys {
		if strings.HasSuffix(k, runSuffix) {
			runs = append(runs, k)
		}
	}
	// runTimeFormat sorts lexicographically in chronological order, so
	// reversing the sorted list gives newest first without parsing.
	sort.Sort(sort.Reverse(sort.StringSlice(runs)))
	return runs, nil
}

// runName is the bare "20060102T150405Z" identifier of an object key,
// which is what callers name a run by.
func runName(key string) string {
	return strings.TrimSuffix(path.Base(key), runSuffix)
}

// writeTempFile puts data in a temp file, since s3store's Upload and
// Download both work in terms of local paths. The file is created with
// 0600 and removed by the caller's defer: even though the contents are
// encrypted, a world-readable temp copy of the platform's state file on
// a manager node is not something to leave lying around.
func writeTempFile(data []byte) (string, error) {
	f, err := os.CreateTemp("", "osi4iot_state_*.enc")
	if err != nil {
		return "", fmt.Errorf("creating temp file: %w", err)
	}
	defer f.Close()

	if err := f.Chmod(0600); err != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("securing temp file: %w", err)
	}
	if _, err := f.Write(data); err != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("writing temp file: %w", err)
	}
	return f.Name(), nil
}

// stringParam pulls a string out of a task's decoded request body.
// Missing and wrong-typed both yield "", which callers treat as
// "not supplied" — see natssvc.decodeParams for why the transport layer
// deliberately doesn't validate shape.
func stringParam(params map[string]any, name string) string {
	if params == nil {
		return ""
	}
	v, ok := params[name].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(v)
}

// newRunKey names a run for the current instant.
func newRunKey(cli *s3store.Client, now time.Time) string {
	return cli.Key(now.UTC().Format(runTimeFormat) + runSuffix)
}

// parseS3URI splits "s3://bucket/prefix/like/this" into bucket and
// prefix. A bare "s3://bucket" is valid and yields an empty prefix.
func parseS3URI(uri string) (bucket, prefix string, err error) {
	const schema = "s3://"
	if !strings.HasPrefix(uri, schema) {
		return "", "", fmt.Errorf("expected an s3:// URI, got %q", uri)
	}
	rest := strings.TrimPrefix(uri, schema)
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
