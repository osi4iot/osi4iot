//go:build darwin

package crypto

import (
	"os/exec"
	"strings"
	"fmt"
)

// getMachineKey obtiene el hardware UUID de macOS
func getMachineKey() ([]byte, error) {
	out, err := exec.Command(
		"ioreg", "-rd1", "-c", "IOPlatformExpertDevice",
	).Output()
	if err != nil {
		return nil, fmt.Errorf("could not get machine UUID: %w", err)
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "IOPlatformUUID") {
			parts := strings.Split(line, "\"")
			if len(parts) >= 4 {
				return []byte(parts[3]), nil
			}
		}
	}
	return nil, fmt.Errorf("IOPlatformUUID not found")
}