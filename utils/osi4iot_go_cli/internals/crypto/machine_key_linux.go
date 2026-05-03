//go:build linux

package crypto

import (
	"fmt"
	"os"
	"strings"
)

// getMachineKey obtiene un identificador único de la máquina.
// En Linux usa /etc/machine-id (presente en todas las distros, incluido EC2)
func getMachineKey() ([]byte, error) {
	data, err := os.ReadFile("/etc/machine-id")
	if err != nil {
		return nil, fmt.Errorf("could not read machine-id: %w", err)
	}
	return []byte(strings.TrimSpace(string(data))), nil
}