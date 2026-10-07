//go:build !windows

package main

import (
    "errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"slices"
	"syscall"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func reexecAsRootIfNeeded(sudoActions []string, action string) {
    if !slices.Contains(sudoActions, action) || os.Getuid() == 0 {
        return
    }

    selfPath, err := os.Executable()
    if err != nil {
        exitWithError(utils.StyleErrMsg.Render("Cannot determine executable path: " + err.Error()))
    }

    if os.Getenv("OSI4IOT_PASSPHRASE") == "" {
        var encodedFile []byte
        if utils.ExistStateFile() {
            encodedFile, _ = os.ReadFile(utils.GetStateFilePath())
        }
        result, err := crypto.GetPassphrase(encodedFile)
        if err != nil {
            exitWithError(utils.StyleErrMsg.Render("Error getting passphrase: " + err.Error()))
        }
        if result != nil && len(result.Value) > 0 {
            os.Setenv("OSI4IOT_PASSPHRASE", string(result.Value))
        }
    }

    signal.Reset(os.Interrupt, syscall.SIGTERM)

    c := exec.Command("sudo", append([]string{"--preserve-env=OSI4IOT_PASSPHRASE", selfPath}, os.Args[1:]...)...)
    c.Stdout = os.Stdout
    c.Stderr = os.Stderr
    c.Stdin = os.Stdin
    if err := c.Run(); err != nil {
        // The command ran and ended with an error: it has already said
        // why. Pass its exit code on as is, without adding the
        // meaningless "exit status 1" of the wrapper.
        var exitErr *exec.ExitError
        if errors.As(err, &exitErr) {
            os.Exit(exitErr.ExitCode())
        }
        // sudo itself could not be run.
        fmt.Println(utils.StyleErrMsg.Render(err.Error()))
        os.Exit(1)
    }
    os.Exit(0)
}