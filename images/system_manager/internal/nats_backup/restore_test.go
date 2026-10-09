package nats_backup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRestoreConfigAtOneReplica(t *testing.T) {
	dir := t.TempDir()
	meta := `{"config":{"name":"ADMIN_0","subjects":["admin.0.>"],"retention":"limits","max_consumers":-1,` +
		`"max_msgs":-1,"max_bytes":-1,"max_age":0,"storage":"file","num_replicas":3,"discard":"old"},` +
		`"state":{"messages":12,"bytes":100,"first_seq":1,"last_seq":12,"consumer_count":1}}`
	if err := os.WriteFile(filepath.Join(dir, "backup.json"), []byte(meta), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := restoreConfigAtOneReplica(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Replicas != 1 || cfg.Name != "ADMIN_0" || len(cfg.Subjects) != 1 {
		t.Fatalf("config %+v", cfg)
	}
}

func TestStreamReplicasFromParams(t *testing.T) {
	// The CLI's value wins, without looking at the connection.
	if got := streamReplicasFor(map[string]any{"replicas": float64(3)}, nil); got != 3 {
		t.Fatalf("got %d", got)
	}
	if got := streamReplicasFor(map[string]any{"replicas": float64(1)}, nil); got != 1 {
		t.Fatalf("got %d", got)
	}
}

