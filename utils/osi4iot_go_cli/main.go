package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"slices"
	"syscall"

	"github.com/osi4iot/osi4iot/utils/osi4iot/cmd"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
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

	noStateCommands := []string{"--help", "-h", "help"}
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

	fmt.Printf("XXXXXXXXXXXXXXXXXXX Action: %s\n", action)

	sudoActions := []string{"create", "init", "run", "stop", "delete", "certs", "nodes", "passphrase"}
	if slices.Contains(sudoActions, action) && os.Getuid() != 0 {
		fmt.Printf("XXXXXXXXXXXXXXXXXXX Paso por sudo actions: %s\n", action)
		selfPath, err := os.Executable()
		if err != nil {
			exitWithError(utils.StyleErrMsg.Render("Cannot determine executable path: " + err.Error()))
		}

		// Resolve the state file path before handing control to sudo,
		// since CWD resolution may differ in the child process.
		absStatePath := utils.GetStateFilePath()
		os.Setenv("OSI4IOT_STATE_PATH", absStatePath)

		// If OSI4IOT_PASSPHRASE is not already set, try to obtain it now
		// (from keystore, encrypted file or prompt) and pass it explicitly
		// to the child. This is necessary because the sudo child may not
		// have access to the user's D-Bus session or keystore.
		if os.Getenv("OSI4IOT_PASSPHRASE") == "" {
			var encodedFile []byte
			if utils.ExistStateFile() {
				encodedFile, _ = os.ReadFile(absStatePath)
			}
			result, err := crypto.GetPassphrase(encodedFile)
			if err != nil {
				exitWithError(utils.StyleErrMsg.Render("Error getting passphrase: " + err.Error()))
			}
			if result != nil && len(result.Value) > 0 {
				os.Setenv("OSI4IOT_PASSPHRASE", string(result.Value))
			}
		}

		preserveEnv := "--preserve-env=OSI4IOT_STATE_PATH,OSI4IOT_PASSPHRASE"

		signal.Reset(os.Interrupt, syscall.SIGTERM)

		c := exec.Command("sudo", append([]string{preserveEnv, selfPath}, os.Args[1:]...)...)
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr
		c.Stdin = os.Stdin
		if err := c.Run(); err != nil {
			fmt.Println(utils.StyleErrMsg.Render(err.Error()))
			os.Exit(1)
		}
		os.Exit(0)
	}

	if action == "passphrase" {
		cmd.Execute()
		return
	}

	existStateFile := utils.ExistStateFile()
	if existStateFile {
		fmt.Printf("XXXXXXXXXXXXXXXXXXX existStateFile: %v\n", existStateFile)
		pd := data.GetData()
		err := utils.ReadPlatformDataFromFile(pd)
		if err != nil {
			errMsg := utils.StyleErrMsg.Render(fmt.Sprintf("Error loading json file: %v", err))
			exitWithError(errMsg)
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
		fmt.Printf("XXXXXXXXXXXXXXXXXXX Paso por empty %s\n", action)
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
