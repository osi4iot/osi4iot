//go:build !windows

package crypto

import (
	"golang.org/x/term"
	"os"
)

func readPassphrase() ([]byte, error) {
	return term.ReadPassword(int(os.Stdin.Fd()))
}