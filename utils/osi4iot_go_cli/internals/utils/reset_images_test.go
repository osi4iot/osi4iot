package utils

import (
	"reflect"
	"testing"

	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func resetImagesFixture() ([]osi_types.ServiceData, map[string]osi_types.ServiceData) {
	state := []osi_types.ServiceData{
		{ServiceName: "frontend", Image: "ghcr.io/osi4iot/frontend_nats:1.3.0", Replicas: 2, Cpu: "1.00CPU", Memory: "512Mb"},
		{ServiceName: "admin_api", Image: "ghcr.io/osi4iot/admin_api_nats:1.4.0", Replicas: 1},
		{ServiceName: "patroni_admin2", Image: "ghcr.io/osi4iot/patroni_admin:18.1", Replicas: 1},
		{ServiceName: "my_custom", Image: "example/custom:1"},
	}
	defaults := map[string]osi_types.ServiceData{
		"frontend":       {ServiceName: "frontend", Image: "ghcr.io/osi4iot/frontend_nats:1.4.0"},
		"admin_api":      {ServiceName: "admin_api", Image: "ghcr.io/osi4iot/admin_api_nats:1.4.0"},
		"patroni_admin2": {ServiceName: "patroni_admin2", Image: "ghcr.io/osi4iot/patroni_admin:18.4-alpine3.24"},
		"grafana":        {ServiceName: "grafana", Image: "ghcr.io/osi4iot/grafana:12.4.13-ubuntu"},
	}
	return state, defaults
}

func TestPlanDefaultImagesAll(t *testing.T) {
	state, defaults := resetImagesFixture()
	plan := PlanDefaultImages(state, defaults, nil)

	wantChanges := []ImageChange{
		{Service: "frontend", Current: "ghcr.io/osi4iot/frontend_nats:1.3.0", Default: "ghcr.io/osi4iot/frontend_nats:1.4.0"},
		{Service: "patroni_admin2", Current: "ghcr.io/osi4iot/patroni_admin:18.1", Default: "ghcr.io/osi4iot/patroni_admin:18.4-alpine3.24"},
	}
	if !reflect.DeepEqual(plan.Changes, wantChanges) {
		t.Fatalf("changes = %+v, want %+v", plan.Changes, wantChanges)
	}
	if !reflect.DeepEqual(plan.Unchanged, []string{"admin_api"}) {
		t.Fatalf("unchanged = %v", plan.Unchanged)
	}
	if !reflect.DeepEqual(plan.NoDefault, []string{"my_custom"}) {
		t.Fatalf("noDefault = %v", plan.NoDefault)
	}
	if !reflect.DeepEqual(plan.Selected, []string{"admin_api", "frontend", "patroni_admin2"}) {
		t.Fatalf("selected = %v", plan.Selected)
	}
	if len(plan.Unknown) != 0 {
		t.Fatalf("unknown = %v", plan.Unknown)
	}
}

func TestPlanDefaultImagesOnly(t *testing.T) {
	state, defaults := resetImagesFixture()
	plan := PlanDefaultImages(state, defaults, []string{"frontend", "nope"})

	if len(plan.Changes) != 1 || plan.Changes[0].Service != "frontend" {
		t.Fatalf("changes = %+v", plan.Changes)
	}
	if !reflect.DeepEqual(plan.Unknown, []string{"nope"}) {
		t.Fatalf("unknown = %v", plan.Unknown)
	}
	if len(plan.Unchanged) != 0 || len(plan.NoDefault) != 0 {
		t.Fatalf("unchanged = %v, noDefault = %v", plan.Unchanged, plan.NoDefault)
	}
}

func TestApplyDefaultImagesKeepsOtherFields(t *testing.T) {
	state, defaults := resetImagesFixture()
	pd := &osi_types.PlatformData{}
	pd.PlatformInfo.ServicesData = state

	changed := ApplyDefaultImages(pd, PlanDefaultImages(state, defaults, nil))
	if changed != 2 {
		t.Fatalf("changed = %d, want 2", changed)
	}
	got := pd.PlatformInfo.ServicesData[0]
	want := osi_types.ServiceData{ServiceName: "frontend", Image: "ghcr.io/osi4iot/frontend_nats:1.4.0", Replicas: 2, Cpu: "1.00CPU", Memory: "512Mb"}
	if got != want {
		t.Fatalf("frontend = %+v, want %+v", got, want)
	}
	if pd.PlatformInfo.ServicesData[3].Image != "example/custom:1" {
		t.Fatalf("entry without default changed: %+v", pd.PlatformInfo.ServicesData[3])
	}
}
