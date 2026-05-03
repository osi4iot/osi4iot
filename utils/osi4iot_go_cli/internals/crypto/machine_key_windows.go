//go:build windows

package crypto

import (
	"os/exec"
	"strings"
	"fmt"
)

// getMachineKey obtiene el MachineGuid del registro de Windows
func getMachineKey() ([]byte, error) {
	out, err := exec.Command(
		"reg", "query",
		`HKLM\SOFTWARE\Microsoft\Cryptography`,
		"/v", "MachineGuid",
	).Output()
	if err != nil {
		return nil, fmt.Errorf("could not get MachineGuid: %w", err)
	}
	parts := strings.Fields(string(out))
	if len(parts) < 3 {
		return nil, fmt.Errorf("MachineGuid not found")
	}
	return []byte(parts[len(parts)-1]), nil
}