package docker

import (
	"context"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Backs `osi4iot init --from-bucket`: standing a platform up again from
// nothing but the bucket it was backing up to.
//
// # Why this is possible at all
//
// DeletePlatform never touches S3. With an external bucket, taking a
// platform down leaves behind the encrypted state file backups, both
// wal-g catalogues, the NATS runs and org_data — which is everything an
// osi4iot_snapshot.zip carries, already in place. The bucket IS the
// snapshot, and the only thing missing from it is the way in: the
// credentials and the passphrase.
//
// (With "Local Minio" none of this applies: that bucket lives in the
// minio_storage volume and RemoveSwarmVolumes takes it with the rest.)
//
// # The two chicken-and-egg problems
//
// The credentials for the bucket are in the state file, which is in the
// bucket. Broken by taking them from the SDK's own chain — environment,
// profile, instance role — or from flags. Whoever administers that
// bucket has them already.
//
// And the wal-g catalogue is normally read through system_manager,
// which needs the platform running — but the catalogue has to be read
// BEFORE the platform starts. As soon as it does, it bootstraps empty
// clusters, and system_manager's scheduled backup can push a backup of
// those empty clusters into this very bucket. That backup would then be
// the newest, and restoring the newest would restore the emptiness over
// the data.
//
// So the catalogue is read straight out of S3, from wal-g's own layout,
// before anything starts. See CaptureBucketCatalogue.

// DefaultStateFileKeyPrefix is where the state file backups live inside
// the bucket. Composed in ui/form/actions.go as
// "s3://<bucket>/backups/state_file" and not configurable there, so the
// same shape is assumed here, with a flag to override it for a platform
// whose prefix was edited by hand.
const DefaultStateFileKeyPrefix = "backups/state_file"

// ExternalBucketOptions says which bucket to read and how to reach it.
type ExternalBucketOptions struct {
	Bucket string
	// KeyPrefix for the state file backups. Empty means
	// DefaultStateFileKeyPrefix.
	KeyPrefix string
	Region    string
	// AccessKeyID and SecretAccessKey are optional: empty means the
	// SDK's credential chain.
	AccessKeyID     string
	SecretAccessKey string
}

// OpenExternalBucket connects to a bucket without a state file.
func OpenExternalBucket(ctx context.Context, opts ExternalBucketOptions) (*PlatformS3, error) {
	if strings.TrimSpace(opts.Bucket) == "" {
		return nil, fmt.Errorf("no bucket given")
	}

	cli, err := awsS3Client(ctx, opts.AccessKeyID, opts.SecretAccessKey, opts.Region, "", nil)
	if err != nil {
		return nil, err
	}

	actual, exists, err := bucketRegion(ctx, cli, opts.Bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, fmt.Errorf("the bucket '%s' does not exist, or these credentials cannot "+
			"see it", opts.Bucket)
	}
	if actual != "" && actual != opts.Region {
		cli, err = awsS3Client(ctx, opts.AccessKeyID, opts.SecretAccessKey, actual, "", nil)
		if err != nil {
			return nil, err
		}
	}

	return &PlatformS3{source: &awsSource{cli: cli}, bucket: opts.Bucket}, nil
}

// StateBackup is one stored state file backup.
type StateBackup struct {
	Key     string
	Size    int64
	Taken   time.Time
	Objects int
}

// LatestStateBackup finds the newest state file backup in the bucket.
func LatestStateBackup(ctx context.Context, store *PlatformS3, opts ExternalBucketOptions) (StateBackup, error) {
	backups, err := ListStateBackups(ctx, store, opts)
	if err != nil {
		return StateBackup{}, err
	}
	newest := backups[0]
	newest.Objects = len(backups)
	return newest, nil
}

// ListStateBackups returns every state file backup in the bucket,
// newest first.
//
// Ordered by the timestamp in the key rather than by LastModified: the
// key is the moment the platform took the backup, and LastModified is
// the moment it landed, which a retry or a copy can move.
//
// The whole list rather than just the newest, because the newest is not
// always the one wanted. A state file recovered after someone broke the
// configuration needs the backup from BEFORE they broke it, and the
// operator is the only one who knows when that was.
func ListStateBackups(ctx context.Context, store *PlatformS3, opts ExternalBucketOptions) ([]StateBackup, error) {
	prefix := opts.KeyPrefix
	if prefix == "" {
		prefix = DefaultStateFileKeyPrefix
	}

	objects, err := store.List(ctx, opts.Bucket, strings.Trim(prefix, "/")+"/")
	if err != nil {
		return nil, err
	}

	var backups []StateBackup
	for _, object := range objects {
		if !strings.HasSuffix(object.Key, ".enc") {
			continue
		}
		backups = append(backups, StateBackup{
			Key:   object.Key,
			Size:  object.Size,
			Taken: stateBackupTime(object.Key, object.ModTime),
		})
	}

	if len(backups) == 0 {
		return nil, fmt.Errorf(
			"no state file backups under s3://%s/%s.\n"+
				"Either this is not an osi4iot bucket, or the platform never had "+
				"STATE_FILE_S3_PREFIX set. Pass --state-prefix if yours is somewhere else",
			opts.Bucket, strings.Trim(prefix, "/"))
	}

	sort.Slice(backups, func(i, j int) bool { return backups[i].Taken.After(backups[j].Taken) })
	return backups, nil
}

// FetchStateBackup downloads one state file backup.
func FetchStateBackup(ctx context.Context, store *PlatformS3, bucket, key string) ([]byte, error) {
	body, err := store.Get(ctx, bucket, key)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	// Bounded: this is read before anything is known about the object,
	// and a state file is tens of kilobytes. Something far larger under
	// that prefix is not one, and reading it into memory to find out
	// would be the wrong way to discover that.
	const maxStateFile = 32 << 20

	data, err := io.ReadAll(io.LimitReader(body, maxStateFile+1))
	if err != nil {
		return nil, fmt.Errorf("error downloading %s: %w", key, err)
	}
	if len(data) > maxStateFile {
		return nil, fmt.Errorf("%s is larger than %d bytes, so it is not a state file",
			key, maxStateFile)
	}
	return data, nil
}

// BucketCatalogue is what the bucket held BEFORE the platform started.
type BucketCatalogue struct {
	AdminBackup   string
	MetricsBackup string
	NatsRun       string
}

// CaptureBucketCatalogue reads the newest restorable backup of each
// cluster, and the newest NATS run, directly from S3.
//
// Read from wal-g's own layout rather than through system_manager,
// because this has to happen before the platform exists. A completed
// base backup leaves a "<name>_backup_stop_sentinel.json" beside its
// directory under basebackups_005; a backup without one was
// interrupted, which is exactly the distinction that matters and the
// reason the directories themselves are not what is listed.
//
// The names captured here are what the restore is told to use. Nothing
// afterwards may ask for LATEST: by then the platform has been running
// with empty clusters and may have backed them up into this bucket.
func CaptureBucketCatalogue(ctx context.Context, store *PlatformS3, pd *pt.PlatformData) (BucketCatalogue, error) {
	var catalogue BucketCatalogue

	if pd.PlatformInfo.UsePatroniTool {
		admin, err := newestWalgBackup(ctx, store, pd.PlatformInfo.WalgS3PrefixAdmin)
		if err != nil {
			return catalogue, fmt.Errorf("patroni_admin: %w", err)
		}
		catalogue.AdminBackup = admin

		metrics, err := newestWalgBackup(ctx, store, pd.PlatformInfo.WalgS3PrefixMetrics)
		if err != nil {
			return catalogue, fmt.Errorf("patroni_metrics: %w", err)
		}
		catalogue.MetricsBackup = metrics
	}

	run, err := newestNatsRun(ctx, store, pd.PlatformInfo.NATSBackupS3Prefix)
	if err != nil {
		return catalogue, err
	}
	catalogue.NatsRun = run

	return catalogue, nil
}

// newestWalgBackup returns the name of the newest completed base backup
// under a wal-g prefix, or "" when there is none.
func newestWalgBackup(ctx context.Context, store *PlatformS3, s3Prefix string) (string, error) {
	if s3Prefix == "" {
		return "", nil
	}
	bucket, keyPrefix, err := ParseS3Prefix(s3Prefix)
	if err != nil {
		return "", err
	}

	objects, err := store.List(ctx, bucket, path.Join(keyPrefix, walgBaseBackupsDir)+"/")
	if err != nil {
		return "", err
	}

	type sentinel struct {
		name string
		at   time.Time
	}
	var sentinels []sentinel

	for _, object := range objects {
		base := path.Base(object.Key)
		if !strings.HasSuffix(base, walgSentinelSuffix) {
			continue
		}
		sentinels = append(sentinels, sentinel{
			name: strings.TrimSuffix(base, walgSentinelSuffix),
			at:   object.ModTime,
		})
	}

	if len(sentinels) == 0 {
		return "", fmt.Errorf("no completed backups under %s", s3Prefix)
	}

	sort.Slice(sentinels, func(i, j int) bool { return sentinels[i].at.After(sentinels[j].at) })
	return sentinels[0].name, nil
}

// newestNatsRun returns the name of the newest NATS backup run, or ""
// when the bucket holds none.
//
// Not an error when there is none: a platform whose JetStream was never
// backed up is a normal platform, and its streams simply come back
// empty.
func newestNatsRun(ctx context.Context, store *PlatformS3, s3Prefix string) (string, error) {
	if s3Prefix == "" {
		return "", nil
	}
	bucket, keyPrefix, err := ParseS3Prefix(s3Prefix)
	if err != nil {
		return "", err
	}

	objects, err := store.List(ctx, bucket, strings.Trim(keyPrefix, "/")+"/")
	if err != nil {
		return "", err
	}

	newest := ""
	for _, object := range objects {
		relative := strings.TrimPrefix(object.Key, strings.Trim(keyPrefix, "/")+"/")
		run, _, found := strings.Cut(relative, "/")
		if !found || run == "" {
			continue
		}
		// The run names are timestamps in a sortable layout
		// (20260918T042757Z), so the newest is the greatest string.
		if run > newest {
			newest = run
		}
	}
	return newest, nil
}

// stateBackupTime reads the moment out of a state file backup's key,
// falling back to the object's own timestamp.
func stateBackupTime(key string, modified time.Time) time.Time {
	base := strings.TrimSuffix(path.Base(key), ".enc")
	if taken, err := time.Parse("20060102T150405Z", base); err == nil {
		return taken.UTC()
	}
	return modified
}