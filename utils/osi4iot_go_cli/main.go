package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/cmd"
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

	cmd.Execute()
}