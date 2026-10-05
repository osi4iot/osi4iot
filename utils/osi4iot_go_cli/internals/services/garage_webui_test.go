package services

import (
	"strings"
	"testing"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func TestGarageWebUIService(t *testing.T) {
	pd := &pt.PlatformData{}
	pd.PlatformInfo.DomainName = "iot.example.com"
	pd.PlatformInfo.S3BucketType = "Local Garage"
	one := uint64(1)
	svc := GarageWebUIService(pd, pt.SwarmData{}, resources.SvcResources{ReplicasPtr: &one})

	if got := svc.TaskTemplate.Placement.Constraints; len(got) != 1 || got[0] != "node.role==manager" {
		t.Fatalf("placement = %v, want only node.role==manager", got)
	}
	labels := svc.Annotations.Labels
	if labels["traefik.http.routers.garage_webui.rule"] != "Host(`iot.example.com`) && PathPrefix(`/garage_webui`)" {
		t.Fatalf("router rule = %q", labels["traefik.http.routers.garage_webui.rule"])
	}
	if labels["traefik.http.services.garage_webui.loadbalancer.server.port"] != "3909" {
		t.Fatal("wrong service port")
	}
	for k := range labels {
		if strings.Contains(k, "stripprefix") {
			t.Fatalf("the app serves under BASE_PATH itself; found %s", k)
		}
	}
	cs := svc.TaskTemplate.ContainerSpec
	if !strings.Contains(strings.Join(cs.Env, " "), "BASE_PATH=/garage_webui") {
		t.Fatalf("env = %v", cs.Env)
	}
	if f := cs.Secrets[0].File; len(cs.Secrets) != 1 || f.Name != "/app/.env" || f.Mode != 0400 || f.UID != "10001" {
		t.Fatalf("secret mount = %+v", cs.Secrets[0].File)
	}
	if hc := cs.Healthcheck; hc == nil || !strings.Contains(strings.Join(hc.Test, " "), "127.0.0.1:3909/garage_webui/") {
		t.Fatal("healthcheck does not probe the served page")
	}
	if *svc.Mode.Replicated.Replicas != 1 {
		t.Fatal("must run one replica")
	}
}
