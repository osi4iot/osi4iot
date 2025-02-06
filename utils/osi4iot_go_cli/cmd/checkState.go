package cmd

import (
	"fmt"
	"os"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

func checkState(action string) {
	platformState := data.GetPlatformState()
	if platformState == data.Empty && action != "create" {
		errMsg := utils.StyleWarningMsg.Render("The platform configuration has not been defined yet. Please create a new platform to define it.")
		fmt.Println(errMsg)
		os.Exit(1)
	}
	switch action {
	case "create":
		if platformState > data.Empty {
			errMsg := utils.StyleWarningMsg.Render("There is a current platform configuration. Please delete it before creating a new one.")
			fmt.Println(errMsg)
			os.Exit(1)
		}
	case "init":
		if platformState == data.Running {
			errMsg := utils.StyleWarningMsg.Render("The platform is already running. Please stop it before initializing a new one")
			fmt.Println(errMsg)
			os.Exit(1)
		}
	case "run":
		if platformState == data.Deleted {
			errMsg := utils.StyleWarningMsg.Render("The platform is deleted. Please initialize it before running it")
			fmt.Println(errMsg)
			os.Exit(1)
		} else if platformState == data.Initiating {
			errMsg := utils.StyleWarningMsg.Render("The platform is initializing. Please wait until it is initialized")
			fmt.Println(errMsg)
			os.Exit(1)
		} else if platformState == data.Running {
			errMsg := utils.StyleWarningMsg.Render("The platform is already running")
			fmt.Println(errMsg)
			os.Exit(1)
		}
	case "stop":
		if platformState == data.Empty || platformState == data.Deleted {
			errMsg := utils.StyleWarningMsg.Render("The platform can not be stopped because it has not been initialized yet.")
			fmt.Println(errMsg)
			os.Exit(1)
		}
	case "delete":
		if platformState == data.Empty || platformState == data.Deleted {
			errMsg := utils.StyleWarningMsg.Render("The platform can not be deleted because it has not been initialized yet.")
			fmt.Println(errMsg)
			os.Exit(1)
		}
	}
}
