package cmd

import (
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
)

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
		if platformState == data.Deleted {
			errMsg := "The platform is deleted. Please initialize it before running it"
			exitWithWarning(errMsg)
		} else if platformState == data.Initiating {
			errMsg := "The platform is initializing. Please wait until it is initialized"
			exitWithWarning(errMsg)
		} else if platformState == data.Running {
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
