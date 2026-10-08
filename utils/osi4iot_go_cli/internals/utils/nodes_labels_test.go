package utils

import (
	"strings"
	"testing"
)

func TestNodeLabelLinesShowEverything(t *testing.T) {
	rows := []NodeRow{
		{Label: "manager_1", OtherLabels: []string{"KEEPALIVED_PRIORITY=0"}},
		{Label: "worker_1", PlacementTags: []string{"admin-id=1", "garage_1", "metrics-id=1", "nats_1", "platform_worker"},
			OtherLabels: []string{"zone=eu-west-3a"}},
		{Hostname: "ip-172-31-10-71"}, // no state-file label, no labels
	}
	lines := nodeLabelLines(rows, 100)
	all := strings.Join(lines, "\n")
	for _, label := range []string{"KEEPALIVED_PRIORITY=0", "garage_1", "platform_worker", "zone=eu-west-3a"} {
		if !strings.Contains(all, label) {
			t.Errorf("%s missing:\n%s", label, all)
		}
	}
	if strings.Contains(all, "...") {
		t.Errorf("something was cut:\n%s", all)
	}
	// Platform labels before the operator's.
	if strings.Index(all, "platform_worker") > strings.Index(all, "zone=eu-west-3a") {
		t.Error("operator label listed before the platform's")
	}
	if !strings.Contains(lines[2], "ip-172-31-10-71") || !strings.HasSuffix(lines[2], "-") {
		t.Errorf("node without labels: %q", lines[2])
	}
}

func TestNodeLabelLinesWrapAligned(t *testing.T) {
	var many []string
	for i := 0; i < 12; i++ {
		many = append(many, "label-number-"+string(rune('a'+i))+"=value")
	}
	lines := nodeLabelLines([]NodeRow{{Label: "worker_1", OtherLabels: many}}, 60)
	if len(lines) < 2 {
		t.Fatalf("no wrap: %v", lines)
	}
	indent := strings.Index(lines[0], "label-number-a")
	for _, l := range lines {
		if len(l) > 60 {
			t.Errorf("line over width: %q", l)
		}
	}
	for _, l := range lines[1:] {
		if strings.TrimLeft(l, " ") == l || len(l)-len(strings.TrimLeft(l, " ")) != indent {
			t.Errorf("continuation not aligned under the first label: %q", l)
		}
	}
}
