package docker

import (
	"errors"
	"os/exec"
	"strings"
	"testing"
)

func TestPatroniProbeScriptsAreValidShell(t *testing.T) {
	for _, family := range []string{"patroni_admin", "patroni_metrics"} {
		tg := patroniProbeTargetOf(family)
		script := tg.psqlScript("haproxy_patroni", tg.writePort, patroniProbeWriteSQL("0123abcd"))
		if out, err := exec.Command("sh", "-n", "-c", script).CombinedOutput(); err != nil {
			t.Fatalf("%s: invalid shell: %v %s\n%s", family, err, out, script)
		}
		replica := tg.replicaCheckScript("0123abcd")
		if out, err := exec.Command("sh", "-n", "-c", replica).CombinedOutput(); err != nil {
			t.Fatalf("%s: invalid replica script: %v %s\n%s", family, err, out, replica)
		}
		if !strings.Contains(replica, "-h localhost") || !strings.Contains(replica, "while [ $i -lt 30 ]") {
			t.Fatalf("%s: replica script\n%s", family, replica)
		}
		for _, want := range []string{"-h haproxy_patroni", "-U " + tg.user, ". " + tg.secretFile,
			"CREATE SCHEMA IF NOT EXISTS osi4iot_probe", "VALUES ('0123abcd')", "pg_is_in_recovery()"} {
			if !strings.Contains(script, want) {
				t.Fatalf("%s: %q missing in\n%s", family, want, script)
			}
		}
	}
	if tg := patroniProbeTargetOf("patroni_metrics"); tg.writePort != 5100 || tg.database != "iot_data_db" {
		t.Fatalf("metrics target %+v", tg)
	}
	if tg := patroniProbeTargetOf("patroni_admin"); tg.writePort != 5000 || tg.database != `"$POSTGRES_DB"` {
		t.Fatalf("admin target %+v", tg)
	}
}

func TestNatsPermissionErrors(t *testing.T) {
	p := &natsPermissionErrors{}
	p.handler(nil, nil, errors.New("nats: slow consumer"))
	if p.denied() != "" {
		t.Fatal("not a permission error")
	}
	p.handler(nil, nil, errors.New(`nats: Permissions Violation for Publish to "osi4iot.probe.core.x"`))
	if !strings.Contains(p.denied(), "osi4iot.probe.core.x") {
		t.Fatalf("denied %q", p.denied())
	}
}

func TestProbeLevels(t *testing.T) {
	h := ServiceHealth{}
	h.probeOK("fine")
	h.probeFailed(HealthDegraded, "replica slow")
	h.probeFailed(HealthDown, "write failed")
	h.probeFailed(HealthDegraded, "later minor")
	if h.Level != HealthDown || len(h.Probe) != 4 || h.Probe[0] != "✓ fine" || h.Probe[2] != "✗ write failed" {
		t.Fatalf("%+v", h)
	}
	if natsReplicaNumber("nats3") != 3 || natsReplicaNumber("garage_1") != 0 {
		t.Fatal("replica number")
	}
}
