//go:build !linux

package docker

import (
    pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// cleanOrphanNetNS is a no-op on non-Linux platforms.
// Network namespace cleanup is only needed on Linux where Docker Swarm runs.
func cleanOrphanNetNS(_ *pt.DockerClient) error {
    return nil
}