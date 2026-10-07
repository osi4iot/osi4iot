package docker

import (
	"fmt"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Scaling NATS across the standalone/cluster boundary (1 → 3 or more)
// rebuilds the cluster empty: NATS has no in-place migration from a
// standalone server's streams to clustered ones. So the streams are
// backed up before and restored after — through system_manager, to and
// from the platform's bucket, like every other backup of the platform.
//
// Nothing is kept on the operator's machine. If the scale fails after
// the backup, the streams are in S3 and `osi4iot backup restore
// nats_streams` brings them back, from any machine.
//
// system_manager's restore always loads the NEWEST run (see its
// nats_backup package). The run taken for the scale is recorded, and the
// restore refuses to go on if another one became the newest meanwhile —
// its daily backup, say — rather than load something other than what
// was backed up for this scale.

// What the scale's backup and restore ask system_manager, as variables
// so their tests can run without a platform.
var (
	natsScaleListStreams   = ListNatsStreams
	natsScaleTriggerBackup = TriggerNatsBackup
	natsScaleListRuns      = ListNatsBackups
	natsScaleRestore       = RestoreNatsBackupFromS3
)

// backupNatsStreamsForScale backs every JetStream stream up to S3 and
// returns the name of the run holding them, or "" if there are no
// streams to carry over.
func backupNatsStreamsForScale(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	streams, err := natsScaleListStreams(pd, dc)
	if err != nil {
		return "", fmt.Errorf("error listing the NATS streams: %w", err)
	}
	if len(streams) == 0 {
		fmt.Println("No JetStream streams to carry over to the cluster.")
		return "", nil
	}

	before, err := natsScaleListRuns(pd, dc)
	if err != nil {
		return "", fmt.Errorf("error listing the NATS backup runs: %w", err)
	}

	fmt.Printf("Backing up %d NATS stream(s) to S3 before rebuilding the cluster...\n", len(streams))
	if _, err := natsScaleTriggerBackup(pd, dc); err != nil {
		return "", fmt.Errorf("error backing up the NATS streams: %w", err)
	}

	runs, err := natsScaleListRuns(pd, dc)
	if err != nil {
		return "", fmt.Errorf("error listing the NATS backup runs: %w", err)
	}
	if len(runs) == 0 || (len(before) > 0 && runs[0].Name == before[0].Name) {
		return "", fmt.Errorf("the NATS backup reported success but stored no new run")
	}
	newest := runs[0]
	if newest.Streams < len(streams) {
		return "", fmt.Errorf("the NATS backup run %s holds %d of the %d streams; not scaling "+
			"with an incomplete backup", newest.Name, newest.Streams, len(streams))
	}
	fmt.Printf("Backed up %d NATS stream(s) to S3 (run %s).\n", newest.Streams, newest.Name)
	return newest.Name, nil
}

// restoreNatsStreamsForScale restores run — the one backupNatsStreamsForScale
// took — into the cluster, widened to its size.
func restoreNatsStreamsForScale(pd *pt.PlatformData, dc *pt.DockerClient, run string) (string, error) {
	runs, err := natsScaleListRuns(pd, dc)
	if err != nil {
		return "", fmt.Errorf("error listing the NATS backup runs: %w", err)
	}
	if len(runs) == 0 || runs[0].Name != run {
		newest := "none"
		if len(runs) > 0 {
			newest = runs[0].Name
		}
		return "", fmt.Errorf("the newest NATS backup run is %s, not %s (the one taken for this "+
			"scale): restoring now would load that one instead. Check the runs with 'osi4iot "+
			"backup list nats_streams' before restoring by hand", newest, run)
	}
	return natsScaleRestore(pd, dc)
}
