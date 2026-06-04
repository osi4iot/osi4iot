//go:build linux

package docker

import (
    "fmt"
    "os"
    "path/filepath"
    "strings"
    "syscall"

    "github.com/docker/docker/api/types/filters"
    "github.com/docker/docker/api/types/network"
    pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// cleanOrphanNetNS removes orphan network namespaces from /var/run/docker/netns/
// that no longer correspond to active overlay networks in the swarm.
// This prevents "error creating vxlan interface: file exists" on redeployment.
func cleanOrphanNetNS(dc *pt.DockerClient) error {
    const netnsDir = "/var/run/docker/netns"

    activeNetworks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{
        Filters: filters.NewArgs(filters.Arg("driver", "overlay")),
    })
    if err != nil {
        return fmt.Errorf("error listing networks: %v", err)
    }

    activeNS := make(map[string]struct{})
    for _, n := range activeNetworks {
        shortID := n.ID
        if len(shortID) > 10 {
            shortID = shortID[:10]
        }
        activeNS["1-"+shortID] = struct{}{}
    }

    protected := map[string]struct{}{
        "default":      {},
        "ingress_sbox": {},
    }

    entries, err := os.ReadDir(netnsDir)
    if err != nil {
        if os.IsNotExist(err) {
            return nil
        }
        return fmt.Errorf("error reading netns dir: %v", err)
    }

    for _, entry := range entries {
        name := entry.Name()

        if _, ok := protected[name]; ok {
            continue
        }
        if strings.HasPrefix(name, "lb_") {
            continue
        }
        if !strings.Contains(name, "-") {
            continue
        }

        if _, active := activeNS[name]; !active {
            nsPath := filepath.Join(netnsDir, name)
            _ = syscall.Unmount(nsPath, syscall.MNT_DETACH)
            if err := os.Remove(nsPath); err != nil && !os.IsNotExist(err) {
                fmt.Printf("Warning: could not remove orphan netns %s: %v\n", name, err)
            } else {
                fmt.Printf("Removed orphan netns: %s\n", name)
            }
        }
    }

    return nil
}