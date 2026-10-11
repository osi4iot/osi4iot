package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
)

// What a command needs of the platform before it can do anything.
type platformNeed int

const (
	needNothing   platformNeed = iota
	needStateFile              // only the platform's definition: any state but Empty
	needSwarm                  // the swarm exists: Stopped, Running, Degraded
	needServices               // the services are deployed: Running, Degraded
)

// platformNeeds says what each command needs, by command path without
// the program name ("service ls", "backup"). The longest matching prefix
// wins, so a subcommand can relax its parent's rule ("certs check").
//
// Not listed, so not checked here: create, init, run, stop and delete,
// which check the state themselves (checkState); and everything that
// works on the state file or locally (state, passphrase, status,
// completion, version, help).
var platformNeeds = map[string]struct {
	need platformNeed
	what string // what there is nothing of, for the message
}{
	"backup":         {needServices, "backups are taken, listed and restored by system_manager"},
	"certs":          {needServices, "certificates are renewed and stored by system_manager"},
	"certs check":    {needStateFile, ""}, // reads the state file only
	"service":        {needServices, "services"},
	"streams":        {needServices, "NATS streams"},
	"custom_service": {needServices, "custom services"},
	"node":           {needSwarm, "swarm nodes"},
}

// requirePlatformFor stops cmd with an explanation when the platform's
// state does not allow it.
func requirePlatformFor(cmd *cobra.Command) {
	path := strings.TrimSpace(strings.TrimPrefix(cmd.CommandPath(), cmd.Root().Name()))
	msg := platformRequirementBlocker(path, data.GetPlatformState(), data.PlatformStateReason)
	if msg != "" {
		exitWithWarning(msg)
	}
}

// platformRequirementBlocker returns why the command at path cannot run
// in state, or "" if it can. Pure, for tests.
func platformRequirementBlocker(path string, state data.PlatformStatus, reason string) string {
	need, what, ok := lookupNeed(path)
	if !ok || need == needNothing {
		return ""
	}
	if need == needStateFile && state != data.Empty {
		return ""
	}
	switch state {
	case data.Running, data.Degraded:
		return ""
	case data.Stopped:
		if need == needSwarm {
			return ""
		}
		return fmt.Sprintf("The platform is stopped: %s. Start it with 'osi4iot run'.", nothingOf(what))
	case data.Deleted:
		return fmt.Sprintf("The platform is deleted: %s. Initialize it with 'osi4iot init'.", nothingOf(what))
	case data.Empty:
		return "No platform is defined here (there is no osi4iot_state.json in this directory). " +
			"Create one with 'osi4iot create'."
	default: // Unknown
		return fmt.Sprintf("The platform's state could not be determined (%s). Check that the "+
			"manager nodes are reachable and Docker is running on them.", reason)
	}
}

func lookupNeed(path string) (platformNeed, string, bool) {
	best := ""
	for prefix := range platformNeeds {
		if (path == prefix || strings.HasPrefix(path, prefix+" ")) && len(prefix) > len(best) {
			best = prefix
		}
	}
	if best == "" {
		return needNothing, "", false
	}
	n := platformNeeds[best]
	return n.need, n.what, true
}

// nothingOf words the message's middle part: "there are no services" for
// a thing, or the sentence as given when it already explains itself.
func nothingOf(what string) string {
	if strings.Contains(what, " by ") {
		return what + ", which is not running"
	}
	return "there are no " + what
}
