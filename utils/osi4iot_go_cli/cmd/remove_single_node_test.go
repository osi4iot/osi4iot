package cmd

import (
	"strings"
	"testing"
)

func TestSingleCopyRefusal(t *testing.T) {
	msg := singleCopyRefusal("ip-1", []string{"nats1", "patroni_admin1", "patroni_metrics1"})
	for _, want := range []string{"Cannot remove ip-1", "only copy of nats1, patroni_admin1, patroni_metrics1",
		"osi4iot backup trigger nats_streams", "osi4iot backup trigger patroni_admin",
		"osi4iot backup trigger patroni_metrics", "node remove ip-1 --rebuild-from-backup",
		"osi4iot backup restore patroni_metrics"} {
		if !strings.Contains(msg, want) {
			t.Fatalf("missing %q in\n%s", want, msg)
		}
	}
}
