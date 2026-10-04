package cmd

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/volumes"
)

// `osi4iot init --reset-passwords` brings a NEW platform up from the
// state file of an old, deleted one, with every secret the platform
// generates for itself replaced: keys, database passwords, NATS
// credentials. The configuration — domain, nodes, bucket, certificates,
// the administrator's own answers — is kept.
//
// Only for a platform that starts empty. Data written under the old
// secrets would be unusable by the new ones: database roles keep the
// passwords they were created with, values admin_api encrypted can only
// be read with the old key, and backups only with the old WAL-G and
// platform keys. Hence the three guards:
//
//   - incompatible with --snapshot-file and --from-bucket, whose whole
//     point is to bring that old data back;
//   - refuses while any volume of the previous platform is left on any
//     node;
//   - empties an external bucket before the new platform writes to it,
//     as `create` does, since nothing in it could be read any more.
const resetPasswordsFlag = "reset-passwords"

// CheckInitResetPasswords rejects --reset-passwords combined with a
// restore, from the raw argument list.
//
// Called from main.go BEFORE PrepareInitFromSnapshot and
// PrepareInitFromBucket: both install a state file on this machine
// before Cobra runs, so a check in the command itself would come after
// the local state had already been replaced.
func CheckInitResetPasswords(args []string) error {
	if !boolFlagFromArgs(args, resetPasswordsFlag) {
		return nil
	}
	if SnapshotFileFromArgs(args) != "" {
		return fmt.Errorf("--%s cannot be combined with --%s: a snapshot brings back data "+
			"encrypted and protected with the old secrets, which the new ones could not read",
			resetPasswordsFlag, snapshotFileFlag)
	}
	if flagValueFromArgs(args, fromBucketFlag) != "" {
		return fmt.Errorf("--%s cannot be combined with --%s: the bucket's backups are "+
			"encrypted with the old keys, which the new ones could not read",
			resetPasswordsFlag, fromBucketFlag)
	}
	return nil
}

// boolFlagFromArgs reports whether a boolean --name flag is set in a raw
// argument list: "--name", or "--name=<true|1>".
func boolFlagFromArgs(args []string, name string) bool {
	for _, arg := range args {
		switch {
		case arg == "--"+name:
			return true
		case strings.HasPrefix(arg, "--"+name+"="):
			value := strings.ToLower(strings.TrimPrefix(arg, "--"+name+"="))
			return value == "true" || value == "1"
		}
	}
	return false
}

// resetPlatformSecrets replaces every generated secret in the state file,
// for an init that starts a new, empty platform. Runs after checkState
// (the Docker client map is built by then) and before InitPlatform.
//
// Nothing is written until every check has passed and the bucket has
// been emptied: a failure at any point before leaves the state file as
// it was, and the command can simply be run again.
func resetPlatformSecrets(pd *pt.PlatformData, assumeYes bool) error {
	leftovers, err := volumes.FindLeftoverPlatformVolumes(pd)
	if err != nil {
		return fmt.Errorf("checking for data of the previous platform: %w", err)
	}
	if len(leftovers) > 0 {
		return fmt.Errorf("volumes of the previous platform are still present:\n  - %s\n"+
			"Its data was written with the old secrets and could not be used with new ones. "+
			"Remove these volumes first, or run init without --%s to reuse them",
			strings.Join(leftovers, "\n  - "), resetPasswordsFlag)
	}

	pi := pd.PlatformInfo
	fmt.Println(utils.StyleWarningMsg.Render(
		"--reset-passwords replaces every secret the platform generates for itself: the JWT and " +
			"encryption keys, the platform master key, the WAL-G key, the sidecar token, every " +
			"database password, the NATS credentials and, with Garage, its RPC secret and "+
			"every service's S3 key (Garage re-imports them when it restarts)."))
	if utils.IsAwsS3(pi) && pi.S3BucketName != "" {
		fmt.Println(utils.StyleWarningMsg.Render(fmt.Sprintf(
			"Anything already in s3://%s (database and NATS backups, state file backups) is "+
				"encrypted with the old keys and will be DELETED.", pi.S3BucketName)))
	}
	if !assumeYes {
		answer, err := promptLine("Continue? [y/N]: ")
		if err != nil {
			return err
		}
		if a := strings.ToLower(answer); a != "y" && a != "yes" {
			return fmt.Errorf("cancelled")
		}
	}

	if err := data.GeneratePlatformSecrets(pd, true); err != nil {
		return err
	}

	// Before the state file is saved: saving it also backs it up to this
	// bucket (see utils.SetStateBackupHook), and that first backup of the
	// new platform must not be among what gets deleted. A no-op for a
	// local Garage, whose bucket goes with its volumes.
	if err := docker.ResetBucketForNewPlatform(pd, log.New(os.Stdout, "", 0)); err != nil {
		return fmt.Errorf("emptying the bucket for the new platform: %w", err)
	}

	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return fmt.Errorf("saving the new secrets to the state file: %w", err)
	}
	fmt.Println(utils.StyleOKMsg.Render("All generated secrets have been replaced"))
	return nil
}
