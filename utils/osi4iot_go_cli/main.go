package main

import (
	"fmt"
	"os"
	"os/signal"
	"slices"
	"syscall"

	"github.com/osi4iot/osi4iot/utils/osi4iot/cmd"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	docker "github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func main() {
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigs
		utils.ShowCursor()
		docker.CleanResources()
		errMsg := utils.StyleWarningMsg.Render("\nAplication aborted by the user")
		fmt.Println(errMsg)
		os.Exit(0)
	}()

	noStateCommands := []string{"--help", "-h", "help", "passphrase"}
	args := os.Args[1:]
	for _, arg := range args {
		for _, noState := range noStateCommands {
			if arg == noState {
				cmd.Execute()
				return
			}
		}
	}

	existStateFile := utils.ExistStateFile()
	if existStateFile {
		pd := data.GetData()
		err := utils.ReadPlatformDataFromFile(pd)
		if err != nil {
			errMsg := utils.StyleErrMsg.Render(fmt.Sprintf("Error loading json file: %v", err))
			exitWithError(errMsg)
		}

		action := "none"
		if len(args) != 0 {
			action = args[0]
		}

		if slices.Contains(cmd.SwarmActions, action) {
			DCMap, dcMapErr := docker.SetDockerClientsMap(pd, action)
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
