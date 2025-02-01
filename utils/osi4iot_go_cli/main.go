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
			panic(fmt.Sprintf("Error loading json file: %v", err))
		}

		err = data.SetInitialPlatformState()
		if err != nil {
			panic(fmt.Sprintf("Error setting initial platform state: %v", err))
		}

		platformData := data.GetData()
		dockerClient, err := docker.InitSwarm(platformData)
		if err != nil {
			panic(fmt.Sprintf("Error initializing swarm: %v", err))
		}
		defer func() {
			if err := dockerClient.Close(); err != nil {
				fmt.Printf("Error closing resources: %v", err)
			}
		}()
	}

	cmd.Execute()
}
