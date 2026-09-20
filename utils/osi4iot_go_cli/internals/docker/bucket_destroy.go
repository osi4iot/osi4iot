package docker

import (
	"context"
	"fmt"
	"log"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// The two places the CLI destroys object-store contents on purpose.
//
// # Where each belongs
//
// DeletePlatform leaves the bucket alone, and that is the default worth
// keeping: with an external bucket it is what makes a platform
// recoverable after a delete, through `init --from-bucket`. Destroying
// it is opt-in, with --remove-bucket.
//
// `create` is the opposite case. A new platform generates new keys,
// WALG_LIBSODIUM_KEY among them, so whatever wal-g backups the bucket
// already holds are not merely someone else's — they cannot be
// decrypted by this platform at all. Leaving them behind puts a chain
// in the catalogue that can never be restored, next to one that can,
// and nothing distinguishes them at a glance. So create starts from an
// empty bucket.
//
// # Local Minio is a different story
//
// There the bucket lives inside the minio_storage volume, and
// RemoveSwarmVolumes takes it with everything else, so --remove-bucket
// has nothing to add. And a create always meets a fresh volume, so
// there is nothing to reset. Both functions say so and stop rather than
// standing up a MinIO client to do nothing.

// RemovePlatformBucket empties and deletes the platform's bucket.
//
// Called BEFORE the platform is taken apart, so a failure here — wrong
// credentials, a bucket policy that refuses — leaves the platform
// standing and the operator able to try again or change their mind.
// Doing it afterwards would mean failing with nothing left to go back
// to.
func RemovePlatformBucket(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) error {
	bucket := pd.PlatformInfo.S3BucketName
	if bucket == "" {
		return nil
	}

	if pd.PlatformInfo.S3BucketType != "Cloud AWS S3" {
		logger.Printf("The bucket lives in the minio_storage volume and goes with it; " +
			"nothing extra to remove.")
		return nil
	}

	ctx := context.Background()
	store, err := OpenPlatformS3(ctx, pd, dc, "", logger)
	if err != nil {
		return fmt.Errorf("%w\nThe bucket has not been touched", err)
	}
	defer store.Close()

	deleted, err := store.Empty(ctx, bucket)
	if err != nil {
		return fmt.Errorf("%w\n%d object(s) were deleted before this failed, so the bucket is "+
			"now incomplete: finish it by hand or leave it", err, deleted)
	}
	logger.Printf("Deleted %d object(s) from s3://%s.", deleted, bucket)

	if err := store.RemoveBucket(ctx, bucket); err != nil {
		return fmt.Errorf("the bucket is empty but could not be deleted: %w", err)
	}
	logger.Printf("Deleted the bucket s3://%s.", bucket)
	return nil
}

// CountBucketObjects reports how much is in the platform's bucket, for
// a warning before something destroys it.
//
// Best effort: a bucket that cannot be reached is not a reason to stop
// a delete, so the caller is expected to treat an error as "unknown"
// rather than as a failure.
func CountBucketObjects(pd *pt.PlatformData, dc *pt.DockerClient) (int, error) {
	bucket := pd.PlatformInfo.S3BucketName
	if bucket == "" {
		return 0, nil
	}

	ctx := context.Background()
	store, err := OpenPlatformS3(ctx, pd, dc, "", nil)
	if err != nil {
		return 0, err
	}
	defer store.Close()

	objects, err := store.List(ctx, bucket, "")
	if err != nil {
		return 0, err
	}
	return len(objects), nil
}

// ResetBucketForNewPlatform empties an external bucket a new platform
// is about to start using.
//
// Runs from `create`, BEFORE anything is deployed: at that point the
// state file exists with its new credentials, the bucket is reachable
// on its own, and nothing of this platform's has been written yet.
// Emptying later would delete the first state file backup the platform
// had just made.
//
// Nothing to do for a local MinIO: its volume is new.
func ResetBucketForNewPlatform(pd *pt.PlatformData, logger *log.Logger) error {
	bucket := pd.PlatformInfo.S3BucketName
	if bucket == "" || pd.PlatformInfo.S3BucketType != "Cloud AWS S3" {
		return nil
	}

	ctx := context.Background()
	store, err := OpenPlatformS3(ctx, pd, nil, "", logger)
	if err != nil {
		return fmt.Errorf("error reaching the bucket '%s': %w", bucket, err)
	}
	defer store.Close()

	if _, err := store.EnsureBucket(ctx, bucket); err != nil {
		return err
	}

	objects, err := store.List(ctx, bucket, "")
	if err != nil {
		return err
	}
	if len(objects) == 0 {
		return nil
	}

	logger.Printf("The bucket s3://%s already holds %d object(s) from an earlier platform.",
		bucket, len(objects))
	logger.Printf("  This platform has new encryption keys, so those backups cannot be read")
	logger.Printf("  by it and would only clutter its catalogues. Removing them.")

	deleted, err := store.Empty(ctx, bucket)
	if err != nil {
		return fmt.Errorf("%w\n%d object(s) were deleted before this failed", err, deleted)
	}
	logger.Printf("  Deleted %d object(s).", deleted)
	return nil
}