package docker

import (
	"fmt"
	"log"
	"strings"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// TakeInitialBackups pushes a first base backup of each Patroni cluster
// on a platform that has just been stood up.
//
// # Why this is not optional
//
// WAL archiving starts the moment the clusters do, and archived WAL on
// its own is worthless: wal-g replays it onto a base backup, so without
// one there is nothing to replay onto. Until system_manager's scheduled
// backup happens to fire — which on a fresh platform can be hours away
// — the platform has no recovery point at all, and nothing says so. A
// failure in that window loses everything since the platform was
// created.
//
// It also makes the platform snapshottable straight away. `osi4iot
// backup snapshot` reads the wal-g catalogue, and an empty catalogue is
// not something it can carry.
//
// # Not fatal
//
// A platform that came up correctly is not a failed deployment because
// a backup did not take. This warns and names the command to run by
// hand rather than unwinding a working install.
func TakeInitialBackups(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) {
	if !pd.PlatformInfo.UsePatroniTool {
		return
	}

	logger.Printf("Taking the first backup of each database cluster...")

	for _, target := range []string{"patroni_admin", "patroni_metrics"} {
		output, err := triggerInitialBackup(pd, dc, target)
		if err != nil {
			logger.Printf("Warning: could not take the first %s backup: %v", target, err)
			logger.Printf("  The cluster is archiving WAL with no base backup to replay it onto, " +
				"so it has no recovery point yet.")
			logger.Printf("  Take one when convenient: osi4iot backup trigger %s", target)
			continue
		}

		logger.Printf("  %s backed up.", target)
		if trimmed := strings.TrimSpace(output); trimmed != "" {
			logger.Printf("    %s", trimmed)
		}
	}
}

// triggerInitialBackup asks for one backup, retrying for a while.
//
// The retry is for Raft, not for flakiness. Every container reporting
// healthy does not mean Patroni has finished electing a leader, and a
// backup asked for before there is one fails outright. On a first start
// the election runs behind the healthchecks often enough that a single
// attempt would make this warning routine, and a warning that fires
// routinely stops being read.
func triggerInitialBackup(pd *pt.PlatformData, dc *pt.DockerClient, target string) (string, error) {
	const attempts = 6

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		var (
			output string
			err    error
		)
		if target == "patroni_admin" {
			output, err = TriggerPatroniAdminBackup(pd, dc)
		} else {
			output, err = TriggerPatroniMetricsBackup(pd, dc)
		}
		if err == nil {
			return output, nil
		}

		lastErr = err
		if attempt < attempts {
			time.Sleep(10 * time.Second)
		}
	}

	return "", fmt.Errorf("after %d attempts over %d seconds: %w",
		attempts, attempts*10, lastErr)
}
