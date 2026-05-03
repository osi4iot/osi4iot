//go:build windows

package certrenewer

import (
	"os"
	"os/exec"
	"syscall"
)

func buildDaemonCmd(execPath string, logF *os.File) *exec.Cmd {
	cmd := exec.Command(execPath, "certs", "renewer", "--daemon")
	cmd.Stdout = logF
	cmd.Stderr = logF
	cmd.Stdin = nil
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
	}
	return cmd
}