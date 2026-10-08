package docker

import "testing"

func TestGarageLabelsAreManagedByThePlatform(t *testing.T) {
	for _, key := range []string{"garage_1", "garage_12", "nats_2", "admin-id", "platform_worker"} {
		if !IsPlatformManagedLabel(key) {
			t.Errorf("%s not managed: node update would let it be removed by hand", key)
		}
	}
	if IsPlatformManagedLabel("KEEPALIVED_PRIORITY") {
		t.Error("an operator label taken as the platform's")
	}
}
