package docker

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/system"
)

// fakeLeavingDaemon answers /swarm/leave with "context deadline
// exceeded" failsFirst times — leaving the node in the swarm, as the
// real daemon does — and leaves for real after that.
type fakeLeavingDaemon struct {
	mu         sync.Mutex
	failsFirst int
	leaves     int
	inSwarm    bool
}

func (f *fakeLeavingDaemon) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case strings.HasSuffix(r.URL.Path, "/info"):
		state := swarm.LocalNodeStateInactive
		if f.inSwarm {
			state = swarm.LocalNodeStateActive
		}
		json.NewEncoder(w).Encode(system.Info{Swarm: swarm.Info{LocalNodeState: state}})
	case strings.HasSuffix(r.URL.Path, "/swarm/leave"):
		f.leaves++
		if f.leaves <= f.failsFirst {
			w.WriteHeader(http.StatusInternalServerError)
			io.WriteString(w, `{"message":"context deadline exceeded"}`)
			return
		}
		f.inSwarm = false
	default:
		http.NotFound(w, r)
	}
}

func fastLeaveRetries(t *testing.T) {
	saved := swarmLeaveRetryWait
	swarmLeaveRetryWait = time.Millisecond
	t.Cleanup(func() { swarmLeaveRetryWait = saved })
}

// The reported case: the first leave times out on the daemon's side.
func TestNodeLeaveSwarmRetriesADaemonTimeout(t *testing.T) {
	fastLeaveRetries(t)
	d := &fakeLeavingDaemon{failsFirst: 1, inSwarm: true}
	dc := fakeDaemonClient(t, d)
	if err := nodeLeaveSwarm(dc); err != nil {
		t.Fatalf("leave failed: %v", err)
	}
	if d.inSwarm || d.leaves != 2 {
		t.Fatalf("inSwarm=%v after %d leave(s)", d.inSwarm, d.leaves)
	}
}

func TestNodeLeaveSwarmAlreadyOut(t *testing.T) {
	fastLeaveRetries(t)
	d := &fakeLeavingDaemon{inSwarm: false} // a failed attempt finished after all
	if err := nodeLeaveSwarm(fakeDaemonClient(t, d)); err != nil || d.leaves != 0 {
		t.Fatalf("err %v, %d leave call(s) for a node already out", err, d.leaves)
	}
}

func TestNodeLeaveSwarmGivesUpWithGuidance(t *testing.T) {
	fastLeaveRetries(t)
	d := &fakeLeavingDaemon{failsFirst: 100, inSwarm: true}
	err := nodeLeaveSwarm(fakeDaemonClient(t, d))
	if err == nil || !strings.Contains(err.Error(), "docker swarm leave --force") {
		t.Fatalf("err = %v", err)
	}
	if d.leaves != swarmLeaveAttempts {
		t.Fatalf("%d attempts, want %d", d.leaves, swarmLeaveAttempts)
	}
}
