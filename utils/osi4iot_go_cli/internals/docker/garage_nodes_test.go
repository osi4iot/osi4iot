package docker

import (
	"strings"
	"testing"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func TestGarageDrainBlocker(t *testing.T) {
	cases := []struct {
		name        string
		ips         []string // one entry per instance
		target      string
		unavailable map[string]string
		blocked     bool
		mentions    string
	}{
		{"one per worker", []string{"A", "B", "C"}, "A", nil, false, ""},
		{"one per worker, C already drained", []string{"A", "B", "C"}, "A",
			map[string]string{"C": "node-c"}, true, "osi4iot node activate node-c"},
		{"2+1, drain the single", []string{"A", "A", "B"}, "B", nil, false, ""},
		{"2+1, drain the double", []string{"A", "A", "B"}, "A", nil, true, "add 1 platform worker"},
		{"all on one worker", []string{"A", "A", "A"}, "A", nil, true, "add 2 platform worker"},
		{"5 over 5, one drained already", []string{"A", "B", "C", "D", "E"}, "A",
			map[string]string{"E": "node-e"}, true, "node-e"},
		{"5 over 5", []string{"A", "B", "C", "D", "E"}, "A", nil, false, ""},
		{"node without instances", []string{"A", "B", "C"}, "Z", nil, false, ""},
		{"unavailable node without instances does not count", []string{"A", "B", "C"}, "A",
			map[string]string{"Z": "node-z"}, false, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			pd := garagePlatform(c.ips...)
			for _, ip := range []string{"A", "B", "C", "D", "E"} {
				if strings.Contains(strings.Join(c.ips, ""), ip) {
					pd.PlatformInfo.NodesData = append(pd.PlatformInfo.NodesData,
						nodeData(ip))
				}
			}
			msg := garageDrainBlocker(pd.PlatformInfo, c.target, "node-"+strings.ToLower(c.target), c.unavailable)
			if (msg != "") != c.blocked {
				t.Fatalf("blocked=%v, want %v: %s", msg != "", c.blocked, msg)
			}
			if c.mentions != "" && !strings.Contains(msg, c.mentions) {
				t.Fatalf("message does not mention %q:\n%s", c.mentions, msg)
			}
		})
	}

	local := garagePlatform("A")
	local.PlatformInfo.GarageReplicationFactor = 1
	if msg := garageDrainBlocker(local.PlatformInfo, "A", "node-a", nil); !strings.Contains(msg, "osi4iot stop") {
		t.Fatalf("single instance: %q", msg)
	}
}

func nodeData(ip string) (n pt.NodeData) {
	n.NodeIP = ip
	n.NodeRole = "Platform worker"
	return n
}
