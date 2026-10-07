package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPlanCompletion(t *testing.T) {
	home := "/home/daniel"
	cases := []struct {
		shell, script, rc string
	}{
		{"bash", "/home/daniel/.local/share/bash-completion/completions/osi4iot", ""},
		{"zsh", "/home/daniel/.zsh/completions/_osi4iot", "/home/daniel/.zshrc"},
		{"fish", "/home/daniel/.config/fish/completions/osi4iot.fish", ""},
		{"powershell", "/home/daniel/.config/osi4iot/completion.ps1", "/home/daniel/profile.ps1"},
	}
	for _, c := range cases {
		plan, err := planCompletion(c.shell, home, "", "/home/daniel/profile.ps1")
		if err != nil {
			t.Fatalf("%s: %v", c.shell, err)
		}
		if plan.Script != c.script || plan.RCFile != c.rc {
			t.Errorf("%s: script %s rc %s", c.shell, plan.Script, plan.RCFile)
		}
	}
	// XDG_DATA_HOME is honoured for bash.
	if plan, _ := planCompletion("bash", home, "/data", ""); plan.Script != "/data/bash-completion/completions/osi4iot" {
		t.Errorf("XDG_DATA_HOME ignored: %s", plan.Script)
	}
	if _, err := planCompletion("tcsh", home, "", ""); err == nil {
		t.Error("tcsh accepted")
	}
	if _, err := planCompletion("powershell", home, "", ""); err == nil {
		t.Error("PowerShell without a profile accepted")
	}
}

func TestAppendBlockOnceIsIdempotent(t *testing.T) {
	rc := filepath.Join(t.TempDir(), ".zshrc")
	os.WriteFile(rc, []byte("export EDITOR=vim"), 0644) // no trailing newline
	plan, _ := planCompletion("zsh", "/home/daniel", "", "")

	added, err := appendBlockOnce(rc, plan.RCBlock)
	if err != nil || !added {
		t.Fatalf("first: added=%v err=%v", added, err)
	}
	added, err = appendBlockOnce(rc, plan.RCBlock)
	if err != nil || added {
		t.Fatalf("second: added=%v err=%v", added, err)
	}
	content, _ := os.ReadFile(rc)
	if strings.Count(string(content), completionBlockStart) != 1 {
		t.Fatalf("block added twice:\n%s", content)
	}
	if !strings.HasPrefix(string(content), "export EDITOR=vim\n") {
		t.Fatalf("existing content damaged:\n%s", content)
	}
}

func TestCompletionInstallIsUnderCompletion(t *testing.T) {
	for _, c := range rootCmd.Commands() {
		if c.Name() == "completion" {
			for _, sub := range c.Commands() {
				if sub.Name() == "install" {
					return
				}
			}
		}
	}
	t.Fatal("osi4iot completion install is not registered")
}
