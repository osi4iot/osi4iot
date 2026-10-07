package cmd

import (
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
)

func TestPlatformRequirementBlocker(t *testing.T) {
	cases := []struct {
		path    string
		state   data.PlatformStatus
		blocked bool
		says    string
	}{
		// The reported ones, on a deleted platform.
		{"backup list", data.Deleted, true, "osi4iot init"},
		{"node ls", data.Deleted, true, "osi4iot init"},
		{"service ls", data.Deleted, true, "there are no services"},
		{"streams ls", data.Deleted, true, "there are no NATS streams"},
		{"certs check", data.Deleted, false, ""}, // works from the state file
		{"certs check", data.Empty, true, "osi4iot create"},
		// Stopped: the swarm is there, the services are not.
		{"node ls", data.Stopped, false, ""},
		{"service ls", data.Stopped, true, "osi4iot run"},
		{"backup trigger", data.Stopped, true, "system_manager, which is not running"},
		// Deployed, with or without problems.
		{"service ls", data.Running, false, ""},
		{"streams ls", data.Degraded, false, ""},
		// Not gated here.
		{"state export", data.Deleted, false, ""},
		{"status", data.Deleted, false, ""},
		{"passphrase change", data.Empty, false, ""},
		// No platform at all, or no answer.
		{"service ls", data.Empty, true, "osi4iot create"},
		{"service ls", data.Unknown, true, "ssh: timeout"},
	}
	for _, c := range cases {
		msg := platformRequirementBlocker(c.path, c.state, "ssh: timeout")
		if (msg != "") != c.blocked {
			t.Errorf("%s in %v: blocked=%v, want %v (%q)", c.path, c.state, msg != "", c.blocked, msg)
		}
		if c.says != "" && !strings.Contains(msg, c.says) {
			t.Errorf("%s in %v: %q does not say %q", c.path, c.state, msg, c.says)
		}
	}
}

// Every prefix in the table must be a real command: a renamed command
// would otherwise silently lose its check.
func TestPlatformNeedsNameRealCommands(t *testing.T) {
	paths := map[string]bool{}
	var walk func(c *cobra.Command)
	walk = func(c *cobra.Command) {
		paths[strings.TrimSpace(strings.TrimPrefix(c.CommandPath(), rootCmd.Name()))] = true
		for _, sub := range c.Commands() {
			walk(sub)
		}
	}
	walk(rootCmd)
	for prefix := range platformNeeds {
		if !paths[prefix] {
			t.Errorf("platformNeeds names %q, which is not a command", prefix)
		}
	}
}
