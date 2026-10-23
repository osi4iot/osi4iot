package services

import "testing"

func TestPipelinesMemoryEnv(t *testing.T) {
	env := PipelinesMemoryEnv(2 << 30) // 2 GiB
	if env["GOMEMLIMIT"] != "1228MiB" || env["MALLOC_ARENA_MAX"] != "2" {
		t.Fatalf("2 GiB: %v", env)
	}
	env = PipelinesMemoryEnv(0)
	if _, ok := env["GOMEMLIMIT"]; ok || env["MALLOC_ARENA_MAX"] != "2" {
		t.Fatalf("no limit: %v", env)
	}
}
