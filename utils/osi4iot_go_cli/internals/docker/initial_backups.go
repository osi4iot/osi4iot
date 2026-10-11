package docker

import (
	"fmt"
	"log"
	"strings"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// TakeInitialBackups takes the first backup of everything the platform
// backs up, on a platform that has just been stood up: each Patroni
// cluster, the NATS JetStream streams and the state file.
//
// # Why this is not optional
//
// system_manager backs each of these up on a schedule — by default once
// a day at 00:00 UTC — and its scheduler waits for the next scheduled
// time; it does not run anything at start-up. On a fresh platform that
// can be most of a day without a recovery point, and nothing says so:
//
//   - WAL archiving starts the moment the Patroni clusters do, and
//     archived WAL on its own is worthless: wal-g replays it onto a base
//     backup, so without one there is nothing to replay onto.
//   - NATS streams have no backup at all until the first scheduled run.
//   - The state file is normally backed up on every write (see
//     utils.SetStateBackupHook), but only when system_manager is already
//     reachable at the moment of the write; taking one here, last,
//     guarantees a copy of the state the deployment ended with.
//
// It also makes the platform snapshottable straight away: `osi4iot
// backup snapshot` reads these catalogues, and an empty one is not
// something it can carry.
//
// # Not fatal
//
// A platform that came up correctly is not a failed deployment because
// a backup did not take. Each failure warns and names the command to run
// by hand rather than unwinding a working install.
func TakeInitialBackups(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) {
	logger.Printf("Taking the first backups of the platform...")
	takeBackupRound(pd, dc, logger, &backupRound{name: "first"})
}

// TakeFinalBackups takes a last backup of everything, for a platform
// about to be deleted whose bucket survives it (an external AWS S3
// bucket, kept): what the bucket holds is what `osi4iot init
// --from-bucket` will rebuild the platform from.
//
// Between scheduled runs the bucket lags behind: Postgres archives WAL
// a segment at a time (archive_timeout bounds the wait), and NATS
// streams are backed up once a day. A fresh base backup leaves each
// database consistent as of now; a fresh NATS run captures the streams
// as they are.
//
// Returns the targets whose backup could not be taken, so the caller can
// decide whether to delete anyway.
func TakeFinalBackups(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) []string {
	logger.Printf("Taking final backups, so the bucket holds the platform as it is now...")
	round := &backupRound{name: "final", final: true}
	takeBackupRound(pd, dc, logger, round)
	return round.failed
}

// backupRound is one pass over everything the platform backs up: the
// first one, after a deployment, or the final one, before a delete.
type backupRound struct {
	name   string // "first" or "final", for the messages
	final  bool
	failed []string
}

func takeBackupRound(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger, round *backupRound) {
	if pd.PlatformInfo.UsePatroniTool {
		takePatroniBackup(pd, dc, logger, round, "patroni_admin", initialTriggerPatroniAdmin)
		takePatroniBackup(pd, dc, logger, round, "patroni_metrics", initialTriggerPatroniMetrics)
	}
	takeNatsBackup(pd, dc, logger, round)
	// Last, so the copy is of the state file as the platform is now.
	takeStateFileBackup(pd, dc, logger, round)
}

// backupTrigger asks system_manager for one backup and returns its report.
type backupTrigger func(pd *pt.PlatformData, dc *pt.DockerClient) (string, error)

// What the backup rounds reach out to, as variables so their tests can
// run them without a platform.
var (
	initialTriggerPatroniAdmin   backupTrigger = TriggerPatroniAdminBackup
	initialTriggerPatroniMetrics backupTrigger = TriggerPatroniMetricsBackup
	initialTriggerNats           backupTrigger = TriggerNatsBackup
	initialTriggerStateFile      backupTrigger = BackupStateFileOnDisk
	initialListNatsStreams                     = ListNatsStreams
	initialSleep                               = time.Sleep
)

// backupFailed records and reports a backup that could not be taken.
func backupFailed(logger *log.Logger, round *backupRound, target, command string, err error, firstNote string) {
	round.failed = append(round.failed, target)
	logger.Printf("Warning: could not take the %s %s backup: %v", round.name, target, err)
	if round.final {
		logger.Printf("  The bucket keeps %s as of its last backup.", target)
		return
	}
	if firstNote != "" {
		logger.Printf("  %s", firstNote)
	}
	logger.Printf("  Take one when convenient: osi4iot backup trigger %s", command)
}

func takePatroniBackup(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger,
	round *backupRound, target string, trigger backupTrigger) {
	output, err := triggerInitialBackup(pd, dc, trigger)
	if err != nil {
		backupFailed(logger, round, target, target, err,
			"The cluster is archiving WAL with no base backup to replay it onto, "+
				"so it has no recovery point yet.")
		return
	}
	reportInitialBackup(logger, target, output)
}

// initialNatsStreamsWait bounds how long to wait for the platform's
// services to have created their JetStream streams (pipelines' streams,
// the KV buckets — which are streams too) before asking for the first
// backup.
const initialNatsStreamsWait = 60 * time.Second

// takeNatsBackup asks for a NATS streams backup.
//
// On a platform just deployed it first waits for there to be streams:
// "all services healthy" does not mean they have all created theirs yet,
// and system_manager answers a backup of zero streams with success and
// nothing uploaded — the operator would see "nats_streams backed up" and
// find nothing in the bucket. Before a delete there is nothing to wait
// for: whatever streams exist are the ones to keep.
func takeNatsBackup(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger, round *backupRound) {
	const target = "nats_streams"
	if pd.PlatformInfo.NATSBackupS3Prefix == "" {
		logger.Printf("Warning: NATS stream backups are not configured "+
			"(NATS_BACKUP_S3_PREFIX is empty in the platform state); skipping %s.", target)
		return
	}

	wait := initialNatsStreamsWait
	if round.final {
		wait = 0
	}
	count, listErr := waitForNatsStreams(pd, dc, wait)
	if listErr == nil && count == 0 {
		if round.final {
			logger.Printf("  %s: there are no JetStream streams; nothing to back up.", target)
		} else {
			logger.Printf("  %s: no JetStream streams exist yet, so there is nothing to back up; "+
				"system_manager's scheduled backup will take the first one.", target)
		}
		return
	}
	// listErr != nil: the CLI could not reach NATS itself (that needs
	// the client port reachable from this machine). system_manager
	// reaches it from inside the platform, so ask anyway and let its
	// answer say what happened.

	output, err := triggerInitialBackup(pd, dc, initialTriggerNats)
	if err != nil {
		backupFailed(logger, round, target, target, err,
			"The streams have no backup until system_manager's scheduled one.")
		return
	}
	reportInitialBackup(logger, target, output)
}

// waitForNatsStreams polls until at least one JetStream stream exists or
// the wait is over, and returns how many there are. An error means the
// streams could not be listed at all.
func waitForNatsStreams(pd *pt.PlatformData, dc *pt.DockerClient, wait time.Duration) (int, error) {
	// Counted in polls rather than against the clock, so the tests'
	// stubbed sleep ends the wait too.
	const poll = 5 * time.Second
	for waited := time.Duration(0); ; waited += poll {
		streams, err := initialListNatsStreams(pd, dc)
		if err == nil && len(streams) > 0 {
			return len(streams), nil
		}
		if waited >= wait {
			if err != nil {
				return 0, err
			}
			return 0, nil
		}
		initialSleep(poll)
	}
}

func takeStateFileBackup(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger, round *backupRound) {
	const target = "state_file"
	output, err := triggerInitialBackup(pd, dc, initialTriggerStateFile)
	if err != nil {
		backupFailed(logger, round, target, "state", err, "")
		return
	}
	reportInitialBackup(logger, target, output)
}

func reportInitialBackup(logger *log.Logger, target, output string) {
	logger.Printf("  %s backed up.", target)
	if trimmed := strings.TrimSpace(output); trimmed != "" {
		for _, line := range strings.Split(trimmed, "\n") {
			logger.Printf("    %s", line)
		}
	}
}

// triggerInitialBackup asks for one backup, retrying for a while.
//
// The retry is for start-up ordering, not for flakiness. Every container
// reporting healthy does not mean Patroni has finished electing a leader,
// or that system_manager has finished connecting to NATS, and a backup
// asked for before then fails outright. A single attempt would make
// these warnings routine, and a warning that fires routinely stops being
// read.
func triggerInitialBackup(pd *pt.PlatformData, dc *pt.DockerClient, trigger backupTrigger) (string, error) {
	const attempts = 6

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		output, err := trigger(pd, dc)
		if err == nil {
			return output, nil
		}

		lastErr = err
		if attempt < attempts {
			initialSleep(10 * time.Second)
		}
	}

	return "", fmt.Errorf("after %d attempts over %d seconds: %w",
		attempts, attempts*10, lastErr)
}
