package services

import (
	"strings"
	"testing"

	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func TestGarageInstanceServices(t *testing.T) {
	pd := &pt.PlatformData{}
	pd.PlatformInfo = pt.PlatformInfo{S3BucketType: utils.S3BucketTypeGarage,
		DeploymentLocation: "On-premise cluster deployment", DeploymentMode: "development",
		NodesData: []pt.NodeData{{NodeIP: "10.0.0.1", NodeRole: "Manager"},
			{NodeIP: "10.0.0.2", NodeRole: "Platform worker"}}}
	utils.EnsureGarageInstances(&pd.PlatformInfo)

	for _, inst := range pd.PlatformInfo.GarageInstances {
		primary := inst.ID == 1
		svc := GarageService(pd, pt.SwarmData{}, resources.SvcResources{}, inst, primary, true)

		if svc.Name != utils.GarageInstanceServiceName(inst.ID) {
			t.Fatalf("name %s", svc.Name)
		}
		want := "node.labels.garage_" + string(rune('0'+inst.ID)) + "==true"
		if c := svc.TaskTemplate.Placement.Constraints; len(c) != 1 || c[0] != want {
			t.Fatalf("%s placement %v, want %s", svc.Name, c, want)
		}
		if svc.EndpointSpec.Mode != swarm.ResolutionModeDNSRR {
			t.Fatalf("%s not DNS round-robin", svc.Name)
		}
		nets := svc.TaskTemplate.Networks
		if len(nets) != 1 || len(nets[0].Aliases) != 1 || nets[0].Aliases[0] != "garage" {
			t.Fatalf("%s networks %+v", svc.Name, nets)
		}
		// Three instances on one node cannot all publish 3900.
		if len(svc.EndpointSpec.Ports) != 0 {
			t.Fatalf("%s publishes ports in a multi-instance cluster", svc.Name)
		}
		var mounts []string
		for _, s := range svc.TaskTemplate.ContainerSpec.Secrets {
			mounts = append(mounts, s.File.Name)
		}
		hasProvision := strings.Contains(strings.Join(mounts, ","), "garage_provision")
		if hasProvision != primary {
			t.Fatalf("%s secrets %v (primary=%v)", svc.Name, mounts, primary)
		}
		if *svc.Mode.Replicated.Replicas != 1 {
			t.Fatal("an instance is exactly one task")
		}
		// Several instances: liveness of the local node, never cluster
		// health — Swarm only puts healthy tasks in DNS, and the
		// instances find each other through DNS.
		if hc := strings.Join(svc.TaskTemplate.ContainerSpec.Healthcheck.Test, " "); hc != "CMD garage json-api GetClusterStatus" {
			t.Fatalf("%s healthcheck %q would deadlock cluster formation", svc.Name, hc)
		}
	}

	// A single-instance development Garage keeps its published ports.
	local := &pt.PlatformData{}
	local.PlatformInfo = pt.PlatformInfo{S3BucketType: utils.S3BucketTypeGarage,
		DeploymentLocation: "Local deployment", DeploymentMode: "development",
		NodesData: []pt.NodeData{{NodeIP: "10.0.0.1", NodeRole: "Manager"}}}
	utils.EnsureGarageInstances(&local.PlatformInfo)
	svc := GarageService(local, pt.SwarmData{}, resources.SvcResources{}, local.PlatformInfo.GarageInstances[0], true, true)
	if len(svc.EndpointSpec.Ports) != 2 {
		t.Fatal("single-instance dev Garage should publish its ports")
	}
	if hc := strings.Join(svc.TaskTemplate.ContainerSpec.Healthcheck.Test, " "); hc != "CMD garage health -q" {
		t.Fatalf("single instance healthcheck %q, want garage health", hc)
	}
}

func TestGarageInstanceWithoutClientAlias(t *testing.T) {
	// A new instance during a move: reachable as garage_<ID>, not as garage.
	pd := &pt.PlatformData{}
	pd.PlatformInfo = pt.PlatformInfo{S3BucketType: utils.S3BucketTypeGarage,
		DeploymentLocation: "On-premise cluster deployment",
		NodesData:          []pt.NodeData{{NodeIP: "10.0.0.2", NodeRole: "Platform worker"}}}
	utils.EnsureGarageInstances(&pd.PlatformInfo)
	svc := GarageService(pd, pt.SwarmData{}, resources.SvcResources{}, pd.PlatformInfo.GarageInstances[0], false, false)
	if aliases := svc.TaskTemplate.Networks[0].Aliases; len(aliases) != 0 {
		t.Fatalf("aliases %v, want none", aliases)
	}
}
