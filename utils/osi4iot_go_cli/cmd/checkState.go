package cmd

import (
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
)

// checkState checks the current state of the platform and performs actions based on the provided action string.
// It ensures that the platform is in a valid state for the requested action.
// If the platform is in an invalid state, it exits with a warning message.
func checkState(action string) {
	platformState := data.GetPlatformState()
	if platformState == data.Empty && action != "create" {
		errMsg := "The platform configuration has not been defined yet. Please create a new platform to define it."
		exitWithWarning(errMsg)
	}
	switch action {
	case "create":
		if platformState > data.Empty && platformState < data.Deleted {
			errMsg := "There is a current platform configuration. Please delete it before creating a new one."
			exitWithWarning(errMsg)
		}
	case "init":
		if platformState == data.Running {
			errMsg := "The platform is already running. Please stop it before initializing a new one"
			exitWithWarning(errMsg)
		}
	case "run":
		switch platformState {
		case data.Deleted:
			errMsg := "The platform is deleted. Please initialize it before running it"
			exitWithWarning(errMsg)
		case data.Initiating:
			errMsg := "The platform is initializing. Please wait until it is initialized"
			exitWithWarning(errMsg)
		case data.Running:
			errMsg := "The platform is already running"
			exitWithWarning(errMsg)
		}
	case "stop":
		if platformState == data.Empty || platformState == data.Deleted {
			errMsg := "The platform can not be stopped because it has not been initialized yet."
			exitWithWarning(errMsg)
		}
	case "delete":
		if platformState == data.Empty || platformState == data.Deleted {
			errMsg := "The platform can not be deleted because it has not been initialized yet."
			exitWithWarning(errMsg)
		}
	}
}
