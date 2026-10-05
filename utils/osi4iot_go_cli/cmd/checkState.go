package cmd

import (
	"fmt"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
)

// checkState stops the command when the platform's state does not allow
// it, saying why and what to do instead. See data.PlatformStatus for what
// each state means.
//
// Every rule names the states it accepts or refuses one by one: nothing
// relies on the order of the constants.
func checkState(action string) {
	if msg := stateBlocker(action, data.GetPlatformState(), data.PlatformStateReason, data.PlatformStateDetail); msg != "" {
		exitWithWarning(msg)
	}
}

// stateBlocker returns why action cannot run in state, or "" if it can.
// Separate from checkState so the rules can be tested.
func stateBlocker(action string, state data.PlatformStatus, reason string, degraded []string) string {
	if state == data.Empty && action != "create" {
		return "The platform configuration has not been defined yet. Please create a new platform to define it."
	}
	if state == data.Unknown {
		return fmt.Sprintf("The platform's state could not be determined (%s), so '%s' is not run. "+
			"Check that the manager nodes are reachable and that Docker is running on them.", reason, action)
	}

	degradedNote := ""
	if len(degraded) > 0 {
		degradedNote = " Services without all their tasks running: " + strings.Join(degraded, ", ") + "."
	}

	switch action {
	case "create":
		switch state {
		case data.Empty, data.Deleted:
			return ""
		default:
			return fmt.Sprintf("There is a platform on this machine (it is %s). "+
				"Please delete it before creating a new one.", state)
		}

	case "init":
		switch state {
		case data.Running, data.Degraded:
			return fmt.Sprintf("The platform is deployed (it is %s). Please stop it before "+
				"initializing it again.%s", state, degradedNote)
		}

	case "run":
		switch state {
		case data.Deleted:
			return "The platform is deleted. Please initialize it before running it."
		case data.Running:
			return "The platform is already running."
		}
		// Degraded: allowed — run creates the services that are missing
		// and leaves the others alone, which is how a partly deployed
		// platform is completed.

	case "stop":
		switch state {
		case data.Deleted:
			return "The platform can not be stopped because it has not been initialized yet."
		case data.Stopped:
			return "The platform is already stopped."
		}

	case "delete":
		switch state {
		case data.Deleted:
			return "The platform can not be deleted because it has not been initialized yet."
		}
	}
	return ""
}
