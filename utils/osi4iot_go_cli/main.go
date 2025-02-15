package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/cmd"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

func main() {
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigs
		utils.ShowCursor()
		errMsg := utils.StyleWarningMsg.Render("\nAplication aborted by the user")
		fmt.Println(errMsg)
		os.Exit(0)
	}()

	existStateFile := data.ExistStateFile()
	if existStateFile {
		err := data.ReadPlatformDataFromFile()
		if err != nil {
			errMsg := utils.StyleErrMsg.Render(fmt.Sprintf("Error loading json file: %v", err))
			exitWithError(errMsg)
		}

		args := os.Args[1:]
		action := "none"
		if len(args) != 0 {
			action = args[0]
		}

		platformData := data.GetData()
		DCMap, dcMapErr := docker.SetDockerClientsMap(platformData)
		if dcMapErr != nil {
			err := docker.CheckDockerClientsMap(DCMap, action)
			if err != nil {
				combinedErr := fmt.Errorf("error setting Docker clients map: %w", dcMapErr)
				errMsg := utils.StyleErrMsg.Render(combinedErr.Error())
				exitWithError(errMsg)
			}
		}
		defer func() {
			docker.CleanResources()
		}()

		if action != "none" {
			err := data.SetInitialPlatformState()
			if err != nil {
				errMsg := utils.StyleErrMsg.Render(fmt.Sprintf("Error setting initial platform state: %v", err))
				exitWithError(errMsg)
			}
		}
	} else {
		data.SetPlatformState(data.Empty)
	}

	cmd.Execute()
}

func exitWithError(errMsg string) {
	utils.ShowCursor()
	docker.CleanResources()
	fmt.Println(errMsg)
	os.Exit(1)
}
