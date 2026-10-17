package services

import (
	"slices"
	"testing"

	"github.com/docker/docker/api/types/swarm"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func gpuTestService(global bool, constraints ...string) pt.Service {
	s := pt.Service{TaskTemplate: swarm.TaskSpec{Placement: &swarm.Placement{Constraints: constraints}}}
	if global {
		s.Mode.Global = &swarm.GlobalService{}
	}
	return s
}

func TestGpuAvoidance(t *testing.T) {
	node := func(role, gpu string) pt.NodeData { return pt.NodeData{NodeRole: role, NodeGPU: gpu} }
	cases := []struct {
		name     string
		location string
		nodes    []pt.NodeData
		want     map[string]bool // service -> gets gpu!=nvidia
	}{
		{"local deployment on a GPU machine", "Local deployment",
			[]pt.NodeData{node("Manager", "nvidia")},
			map[string]bool{"admin_api": false, "grafana": false, "pipelines": false}},
		{"local deployment, even if the state file lists more nodes", "Local deployment",
			[]pt.NodeData{node("Manager", ""), node("Platform worker", ""), node("Platform worker", "nvidia")},
			map[string]bool{"admin_api": false, "grafana": false}},
		{"mixed workers", "On-premise cluster deployment",
			[]pt.NodeData{node("Manager", ""), node("Platform worker", ""), node("Platform worker", "nvidia")},
			map[string]bool{"admin_api": true, "grafana": false, "pipelines": false, "vector": false, "nats1": false, "garage_x": false}},
		{"single GPU node", "AWS cluster deployment",
			[]pt.NodeData{node("Manager", "nvidia")},
			map[string]bool{"admin_api": false, "grafana": false, "pipelines": false}},
		{"all workers with GPU", "On-premise cluster deployment",
			[]pt.NodeData{node("Manager", ""), node("Platform worker", "nvidia"), node("Platform worker", "nvidia")},
			map[string]bool{"admin_api": false, "grafana": false}},
		{"no GPU at all", "On-premise cluster deployment",
			[]pt.NodeData{node("Manager", ""), node("Platform worker", "")},
			map[string]bool{"admin_api": false}},
	}
	for _, c := range cases {
		pd := &pt.PlatformData{PlatformInfo: pt.PlatformInfo{DeploymentLocation: c.location, NodesData: c.nodes}}
		services := map[string]pt.Service{
			"admin_api": gpuTestService(false, "node.role==worker", "node.labels.platform_worker==true"),
			"grafana":   gpuTestService(false, "node.role == manager"),
			"pipelines": gpuTestService(false, "node.role==worker", "node.labels.platform_worker==true"),
			"vector":    gpuTestService(true),
			"nats1":     gpuTestService(false, "node.labels.nats_1==true"),
			"garage_x":  gpuTestService(false, "node.labels.garage_x==true"),
		}
		applyGpuAvoidance(services, pd)
		for name, want := range c.want {
			got := slices.Contains(services[name].TaskTemplate.Placement.Constraints, gpuAvoidConstraint)
			if got != want {
				t.Errorf("%s: %s gets %q = %v, want %v", c.name, name, gpuAvoidConstraint, got, want)
			}
		}
	}
}
