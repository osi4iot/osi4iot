package docker

import (
	"fmt"
	"sort"

	"github.com/nats-io/jsm.go"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// What `osi4iot streams ls` shows: the streams of the running NATS, read
// live from JetStream. No backup of any kind is involved — the NATS
// backups go through system_manager to the platform's bucket (see
// backup_triggers.go and nats_scale_backup.go).

// NatsStreamInfo is a compact, display-oriented view of a single JetStream
// stream, decoupling the CLI from the underlying NATS API types.
type NatsStreamInfo struct {
	Name       string
	Replicas   int    // configured replica count
	Leader     string // current leader server name ("" if none/standalone)
	Messages   uint64
	Bytes      uint64
	Peers      int  // total members (leader + replicas)
	AllCurrent bool // every non-leader peer is caught up
}

// ListNatsStreams returns the streams currently present in NATS, with
// authoritative per-stream cluster status. Each stream's Information() request
// is answered by that stream's leader, so Leader/AllCurrent reflect the real
// state rather than the view of whichever node we happen to be connected to.
func ListNatsStreams(pd *pt.PlatformData, dc *pt.DockerClient) ([]NatsStreamInfo, error) {
	nodeIP, err := getNats1NodeIP(dc)
	if err != nil {
		return nil, fmt.Errorf("error getting nats1 node IP: %w", err)
	}

	nc, err := connectDeployCliToNats(pd, nodeIP)
	if err != nil {
		return nil, err
	}
	defer nc.Drain()

	mgr, err := jsm.New(nc)
	if err != nil {
		return nil, fmt.Errorf("error creating JetStream manager: %w", err)
	}

	streams, _, _, err := mgr.Streams(nil)
	if err != nil {
		return nil, fmt.Errorf("error listing streams: %w", err)
	}

	out := make([]NatsStreamInfo, 0, len(streams))
	for _, s := range streams {
		nfo, err := s.Information()
		if err != nil {
			replicas := s.Configuration().Replicas
			if replicas < 1 {
				replicas = 1
			}
			out = append(out, NatsStreamInfo{Name: s.Name(), Replicas: replicas})
			continue
		}

		replicas := nfo.Config.Replicas
		if replicas < 1 {
			replicas = 1
		}

		si := NatsStreamInfo{
			Name:       nfo.Config.Name,
			Replicas:   replicas,
			Messages:   nfo.State.Msgs,
			Bytes:      nfo.State.Bytes,
			Peers:      1,
			AllCurrent: true,
		}
		if nfo.Cluster != nil {
			si.Leader = nfo.Cluster.Leader
			si.Peers = 1 + len(nfo.Cluster.Replicas)
			if si.Leader == "" {
				si.AllCurrent = false
			}
			for _, p := range nfo.Cluster.Replicas {
				if !p.Current || p.Offline {
					si.AllCurrent = false
				}
			}
		}
		out = append(out, si)
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}
