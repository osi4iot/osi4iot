package utils

import "testing"

func TestNatsStreamReplicas(t *testing.T) {
	for servers, want := range map[int]int{0: 1, 1: 1, 3: 3, 5: 3, 7: 3} {
		if got := NatsStreamReplicas(servers); got != want {
			t.Fatalf("%d servers: %d replicas, want %d", servers, got, want)
		}
	}
}
