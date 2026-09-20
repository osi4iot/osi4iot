package docker

import (
	"context"
	"fmt"
	"log"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// EnsurePlatformBucket creates the platform's object-store bucket if it
// is not there yet.
//
// # Why the CLI does this now
//
// It used to be admin_api's job, in dataBaseInitialization. That worked
// only because admin_api came up with everything else, and it stopped
// working the moment `init --snapshot-file` began holding admin_api
// back until the databases were restored: with nothing creating the
// bucket, the first state-file backup of the run failed with
// NoSuchBucket.
//
// The bucket belongs with the volumes and the networks rather than with
// a service's migrations. It is infrastructure the platform needs
// before anything writes to it, which is why this is called from
// createSwarmServices once the services are healthy and BEFORE the
// state file is written — the state-file backup hook fires on that
// write and is the first thing to need a bucket.
//
// Idempotent, and cheap on the path that matters: with MinIO published
// (development) or a real S3 bucket it is one HTTP call. Only a
// production MinIO pays for the helper container, and only for as long
// as the check takes.
//
// Not fatal. A platform whose bucket cannot be created is a platform
// without backups, which is worth a loud warning and is not worth
// refusing to start over.
func EnsurePlatformBucket(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) {
	bucket := pd.PlatformInfo.S3BucketName
	if bucket == "" {
		return
	}

	store, err := OpenPlatformS3(context.Background(), pd, dc, "", nil)
	if err != nil {
		warnBucket(logger, fmt.Sprintf("could not reach the object store to check the "+
			"bucket '%s': %v", bucket, err))
		return
	}
	defer store.Close()

	created, err := store.EnsureBucket(context.Background(), bucket)
	if err != nil {
		warnBucket(logger, err.Error())
		return
	}

	// Said out loud when it happens. A step that prints only on failure
	// leaves no way to tell whether it is wired in at all, which is
	// exactly how the first version of this went unnoticed.
	if created {
		reportBucket(logger, fmt.Sprintf("Created the platform's S3 bucket '%s'", bucket))
	}
}

// warnBucket reports a bucket problem and what it costs.
func warnBucket(logger *log.Logger, message string) {
	reportBucket(logger, "Warning: "+message)
	reportBucket(logger, "  Until the bucket exists, nothing can be backed up: "+
		"not the state file, not the databases, not the NATS streams.")
}

// reportBucket prints on the logger when there is one and on stdout when
// there is not — createSwarmServices prints with fmt rather than a
// logger, so this is callable from both.
func reportBucket(logger *log.Logger, message string) {
	if logger != nil {
		logger.Print(message)
		return
	}
	fmt.Println(message)
}