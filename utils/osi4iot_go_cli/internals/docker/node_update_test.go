package docker

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/client"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// fakeSwarmNode is a Docker API with one node, versioned like Swarm's:
// an update carrying an old version is refused with "update out of
// sequence".
type fakeSwarmNode struct {
	mu   sync.Mutex
	node swarm.Node
}

func (f *fakeSwarmNode) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/nodes/n1"):
		json.NewEncoder(w).Encode(f.node)
	case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/nodes/n1/update"):
		version, _ := strconv.ParseUint(r.URL.Query().Get("version"), 10, 64)
		if version != f.node.Version.Index {
			w.WriteHeader(http.StatusInternalServerError)
			io.WriteString(w, `{"message":"rpc error: code = Unknown desc = update out of sequence"}`)
			return
		}
		var spec swarm.NodeSpec
		json.NewDecoder(r.Body).Decode(&spec)
		f.node.Spec = spec
		f.node.Version.Index++
	default:
		http.NotFound(w, r)
	}
}

func fakeNodeClient(t *testing.T, f *fakeSwarmNode) *pt.DockerClient {
	t.Helper()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	cli, err := client.NewClientWithOpts(client.WithHost("tcp://"+strings.TrimPrefix(srv.URL, "http://")),
		client.WithVersion("1.45"), client.WithHTTPClient(srv.Client()))
	if err != nil {
		t.Fatal(err)
	}
	return &pt.DockerClient{Cli: cli, Ctx: context.Background()}
}

// The reported case: `node remove` took its view of the node, Garage's
// evacuation then relabelled it, and the drain used the old view.
func TestDrainWithAStaleViewKeepsTheCurrentLabels(t *testing.T) {
	f := &fakeSwarmNode{node: swarm.Node{ID: "n1", Meta: swarm.Meta{Version: swarm.Version{Index: 10}},
		Spec: swarm.NodeSpec{Annotations: swarm.Annotations{Labels: map[string]string{"garage_3": "true"}},
			Availability: swarm.NodeAvailabilityActive}}}
	dc := fakeNodeClient(t, f)

	stale := NodeView{Node: f.node} // taken at the start of `node remove`

	// The evacuation relabels the node meanwhile.
	f.mu.Lock()
	f.node.Spec.Labels = map[string]string{"nats_3": "true"}
	f.node.Version.Index = 14
	f.mu.Unlock()

	if err := SetNodeAvailability(dc, stale, swarm.NodeAvailabilityDrain); err != nil {
		t.Fatalf("drain with a stale view: %v", err)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.node.Spec.Availability != swarm.NodeAvailabilityDrain {
		t.Fatal("not drained")
	}
	if _, back := f.node.Spec.Labels["garage_3"]; back || f.node.Spec.Labels["nats_3"] != "true" {
		t.Fatalf("labels %v: the stale view's labels were written back", f.node.Spec.Labels)
	}
}

func TestUpdateNodeLabelsWithAStaleView(t *testing.T) {
	f := &fakeSwarmNode{node: swarm.Node{ID: "n1", Meta: swarm.Meta{Version: swarm.Version{Index: 3}},
		Spec: swarm.NodeSpec{Annotations: swarm.Annotations{Labels: map[string]string{"a": "1"}}}}}
	dc := fakeNodeClient(t, f)
	stale := NodeView{Node: f.node}
	f.mu.Lock()
	f.node.Spec.Labels = map[string]string{"a": "1", "b": "2"}
	f.node.Version.Index = 4
	f.mu.Unlock()

	if err := UpdateNodeLabels(dc, stale, map[string]string{"c": "3"}, []string{"a"}); err != nil {
		t.Fatal(err)
	}
	if got := f.node.Spec.Labels; got["b"] != "2" || got["c"] != "3" || got["a"] != "" {
		t.Fatalf("labels %v", got)
	}
}
