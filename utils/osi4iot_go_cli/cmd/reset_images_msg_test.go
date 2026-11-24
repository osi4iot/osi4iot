package cmd

import (
	"io"
	"os"
	"strings"
	"testing"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
)

func captureStdout(f func()) string {
	r, w, _ := os.Pipe()
	old := os.Stdout
	os.Stdout = w
	f()
	w.Close()
	os.Stdout = old
	b, _ := io.ReadAll(r)
	return string(b)
}

func TestPrintWhenImagesTakeEffect(t *testing.T) {
	cases := map[data.PlatformStatus]string{
		data.Running:  "--apply",
		data.Degraded: "--apply",
		data.Stopped:  "'osi4iot run' starts",
		data.Deleted:  "'osi4iot init' deploys",
		data.Unknown:  "could not be determined",
	}
	for state, want := range cases {
		out := captureStdout(func() { printWhenImagesTakeEffect(state) })
		if !strings.Contains(out, want) {
			t.Errorf("%v: %q does not contain %q", state, out, want)
		}
		if state == data.Stopped && strings.Contains(out, "--apply") {
			t.Errorf("stopped platform still mentions --apply: %q", out)
		}
	}
}

func TestSwarmClientsArgs(t *testing.T) {
	if !UsesSwarmClients([]string{"state", "reset_images"}) || !SwarmClientsOptional([]string{"state", "reset_images", "--yes"}) {
		t.Fatal("reset_images without --apply should use optional clients")
	}
	if SwarmClientsOptional([]string{"state", "reset_images", "--apply"}) {
		t.Fatal("--apply needs the clients")
	}
	if UsesSwarmClients([]string{"state", "export"}) {
		t.Fatal("state export does not use the clients")
	}
}
