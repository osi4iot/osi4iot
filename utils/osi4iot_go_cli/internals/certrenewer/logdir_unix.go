//go:build !windows

package certrenewer

import "fmt"

func logDir(domainName string) string {
    return fmt.Sprintf("/var/log/osi4iot/%s", domainName)
}