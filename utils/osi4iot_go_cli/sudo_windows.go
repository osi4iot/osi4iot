//go:build windows

package main

import (
    "fmt"
    "os"
    "slices"
    "golang.org/x/sys/windows"

    "github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func reexecAsRootIfNeeded(sudoActions []string, action string) {
    if !slices.Contains(sudoActions, action) {
        return
    }

    // Check if already running as administrator
    if windows.GetCurrentProcessToken().IsElevated() {
        return
    }

    errMsg := utils.StyleErrMsg.Render(
        fmt.Sprintf("'%s' requires administrator privileges. Please run as Administrator.", action),
    )
    fmt.Println(errMsg)
    os.Exit(1)
}