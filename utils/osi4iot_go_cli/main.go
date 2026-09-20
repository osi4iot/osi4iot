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

	args := os.Args[1:]

	if len(args) >= 3 && args[0] == "certs" && args[1] == "renewer" && args[2] == "daemon" {
		cmd.Execute()
		return
	}

	noStateCommands := []string{"--help", "-h", "help", "version"}
	for _, arg := range args {
		for _, noState := range noStateCommands {
			if arg == noState {
				cmd.Execute()
				return
			}
		}
	}

	action := "none"
	if len(args) != 0 {
		action = args[0]
	}

	sudoActions := []string{"create", "init", "run", "stop", "delete", "certs", "node", "passphrase", "streams"}
	reexecAsRootIfNeeded(sudoActions, action)

	if action == "passphrase" {
		cmd.Execute()
		return
	}

	// `osi4iot init --snapshot-file <bundle>` has to configure this
	// machine BEFORE anything below runs. On a machine that has never
	// held a platform there is no state file, so the else branch would
	// set the state to Empty, the Docker client map would never be
	// built, and cmd.checkState("init") would stop with "the platform
	// configuration has not been defined yet".
	//
	// Installing the state file out of the bundle here turns the rest
	// of this function into an ordinary run that happens to find a
	// configuration already in place. A no-op for every other command,
	// and for an `init` without the flag.
	if action == "init" {
		if err := cmd.PrepareInitFromSnapshot(args); err != nil {
			exitWithError(utils.StyleErrMsg.Render(err.Error()))
		}
		if err := cmd.PrepareInitFromBucket(args); err != nil {
			exitWithError(utils.StyleErrMsg.Render(err.Error()))
		}
	}

	existStateFile := utils.ExistStateFile()
	if existStateFile {
		pd := data.GetData()
		err := utils.ReadPlatformDataFromFile(pd)
		if err != nil {
			// A state file that won't load is exactly what
			// `osi4iot state recover` exists to fix, so bailing out
			// here would lock the operator out of the one command that
			// could help. Every other action genuinely needs the file,
			// and still stops.
			if action != "state" {
				errMsg := utils.StyleErrMsg.Render(fmt.Sprintf("Error loading json file: %v", err))
				exitWithError(errMsg)
			}
			fmt.Println(utils.StyleErrMsg.Render(
				fmt.Sprintf("Warning: the state file could not be loaded (%v).\n"+
					"Continuing so it can be restored — other commands will not work until it is.", err)))
			data.SetPlatformState(data.Empty)
			cmd.Execute()
			return
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