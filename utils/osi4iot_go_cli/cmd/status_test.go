package cmd

import (
	"errors"
	"strings"
	"testing"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func svc(name string, required, running int) data.ServiceStatus {
	return data.ServiceStatus{Name: name, Required: required, Running: running}
}

func garageInfo() pt.PlatformInfo {
	pi := pt.PlatformInfo{PlatformName: "OSI-DEMO", DomainName: "dicapuaiot.com",
		DeploymentLocation: "AWS cluster deployment", DeploymentMode: "production",
		S3BucketType: utils.S3BucketTypeGarage, GarageReplicationFactor: 3}
	utils.NewGarageInstance(&pi, "172.31.9.161")
	utils.NewGarageInstance(&pi, "172.31.10.71")
	utils.NewGarageInstance(&pi, "172.31.7.0")
	return pi
}

func mustContain(t *testing.T, out string, parts ...string) {
	t.Helper()
	for _, p := range parts {
		if !strings.Contains(out, p) {
			t.Errorf("missing %q in:\n%s", p, out)
		}
	}
}

func TestStatusRunning(t *testing.T) {
	out := renderStatus(statusInput{
		Info: garageInfo(), State: data.Running,
		Services: []data.ServiceStatus{svc("admin_api", 1, 1), svc("garage_1", 1, 1)},
		Nodes: []statusNode{{"ip-172-31-7-20", "172.31.7.20", "Manager", "ready", "active"},
			{"ip-172-31-9-161", "172.31.9.161", "Platform worker", "down", "active"}},
	})
	mustContain(t, out, "OSI-DEMO (dicapuaiot.com)", "running", "2 of 2 with all their tasks running",
		"Garage, 3 instance(s), replication factor 3", "172.31.9.161: garage_1",
		"ip-172-31-9-161", "down")
}

func TestStatusDegradedNamesServices(t *testing.T) {
	out := renderStatus(statusInput{
		Info: garageInfo(), State: data.Degraded, Degraded: []string{"garage_4 (0/1)"},
		Services: []data.ServiceStatus{svc("admin_api", 1, 1), svc("garage_4", 1, 0)},
	})
	mustContain(t, out, "running with problems", "1 of 2", "garage_4 (0/1)")
}

func TestStatusUnknownSaysWhyAndListsStateFileNodes(t *testing.T) {
	out := renderStatus(statusInput{
		Info: garageInfo(), State: data.Unknown, Reason: "no manager could be reached: ssh: timeout",
		Nodes:    []statusNode{{"ip-172-31-7-20", "172.31.7.20", "Manager", "", ""}},
		NodesErr: errors.New("no manager"),
	})
	mustContain(t, out, "unknown", "ssh: timeout", "ip-172-31-7-20", "?", "could not be listed")
}

func TestStatusPendingGarageChange(t *testing.T) {
	pi := garageInfo()
	pi.GaragePendingMove = &pt.GarageMove{OldID: 2, NewID: 4, ToIP: "172.31.10.71"}
	out := renderStatus(statusInput{Info: pi, State: data.Running})
	mustContain(t, out, "left half-way", "osi4iot service rebalance garage")
}

func TestStatusEmpty(t *testing.T) {
	mustContain(t, renderStatus(statusInput{State: data.Empty}), "osi4iot create")
}

func TestStatusDeletedShowsNoDeploymentDetails(t *testing.T) {
	// The reported case: a deleted local platform. No swarm, so nothing
	// may be listed from it, and the state file's Garage instances do
	// not exist either.
	out := renderStatus(statusInput{Info: garageInfo(), State: data.Deleted})
	mustContain(t, out, "OSI-DEMO (dicapuaiot.com)", "deleted", "osi4iot init")
	for _, unwanted := range []string{"Nodes", "Object store", "garage_1", "could not be listed"} {
		if strings.Contains(out, unwanted) {
			t.Errorf("%q shown for a deleted platform:\n%s", unwanted, out)
		}
	}
}
