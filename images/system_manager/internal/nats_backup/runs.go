package nats_backup

import (
	"context"
	"fmt"
	"sort"

	"system_manager/internal/s3store"
)

// This file is the only place nats_backup knows what a "run" is — one
// backup attempt, named by its UTC timestamp, holding one .tar.gz
// object per stream. Everything below is built entirely on s3store's
// generic Client (upload/download/list/delete on a bucket+prefix); none
// of it is S3-specific in its own right, which is what let s3store move
// out into its own package independent of nats_backup.

// newS3Client builds an s3store.Client scoped to cfg's NATS backup
// bucket/prefix, using the AWS credentials captured once at
// nats_backup.LoadConfig() time (see Config's doc comment for why that
// matters — this is not the SDK's ambient default credential chain).
func newS3Client(ctx context.Context, cfg Config) (*s3store.Client, error) {
	return s3store.New(ctx, s3store.Config{
		Bucket:          cfg.s3Bucket,
		Prefix:          cfg.s3Prefix,
		Region:          cfg.awsRegion,
		AccessKeyID:     cfg.awsAccessKeyID,
		SecretAccessKey: cfg.awsSecretAccessKey,
		Endpoint:        cfg.s3Endpoint,
		ForcePathStyle:  cfg.s3ForcePathStyle,
	})
}

// listRuns returns every backup run's timestamp name, oldest first —
// each one a "directory" one level below the client's prefix, so this
// never has to enumerate every object inside every run just to find out
// which runs exist.
func listRuns(ctx context.Context, s3c *s3store.Client) ([]string, error) {
	runs, err := s3c.ListCommonPrefixes(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("listing runs under s3://%s/%s: %w", s3c.Bucket(), s3c.GroupPrefix(), err)
	}
	sort.Strings(runs) // timestamp names (20060102T150405Z) sort chronologically as plain strings
	return runs, nil
}

// listRunObjects returns every object key belonging to run.
func listRunObjects(ctx context.Context, s3c *s3store.Client, run string) ([]string, error) {
	keys, err := s3c.ListObjects(ctx, run)
	if err != nil {
		return nil, fmt.Errorf("listing objects under s3://%s/%s: %w", s3c.Bucket(), s3c.GroupPrefix(run), err)
	}
	return keys, nil
}

// deleteRun removes every object belonging to run — the S3 equivalent
// of wal-g's own "delete retain" for Postgres (see internal/patroni_backup
// and patroni_sidecar's runDeleteRetain).
func deleteRun(ctx context.Context, s3c *s3store.Client, run string) error {
	keys, err := listRunObjects(ctx, s3c, run)
	if err != nil {
		return err
	}
	if err := s3c.DeleteObjects(ctx, keys); err != nil {
		return fmt.Errorf("deleting run %s: %w", run, err)
	}
	return nil
}

// applyRetention keeps only the retain most recent runs (as returned by
// listRuns, which sorts oldest first) and deletes the rest. Mirrors
// backup.Target's "retain N full backups" policy (internal/patroni_backup),
// applied here to S3 runs instead of wal-g FULL backups.
func applyRetention(ctx context.Context, s3c *s3store.Client, retain int) ([]string, error) {
	runs, err := listRuns(ctx, s3c)
	if err != nil {
		return nil, err
	}
	if len(runs) <= retain {
		return nil, nil
	}

	toDelete := runs[:len(runs)-retain]
	var deleted []string
	for _, run := range toDelete {
		if err := deleteRun(ctx, s3c, run); err != nil {
			return deleted, err
		}
		deleted = append(deleted, run)
	}
	return deleted, nil
}
