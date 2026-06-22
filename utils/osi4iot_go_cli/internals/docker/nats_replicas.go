package docker

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/nats-io/nkeys"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// connectDeployCliToNats connects to nats1 as the deploy_cli infra
// service (see auth_callout's infra.go), authenticating via Nkey rather
// than the AUTH-account username/password — that path goes through
// auth_callout's external auth flow, while the Nkey path is recognized
// directly and mapped to the APP account with JetStream-admin-only
// permissions.
//
// It connects directly to nats1's node IP (not the "nats1" overlay DNS
// alias), because this CLI runs as a host binary on the manager node,
// outside of the Swarm overlay network — the same reason
// waitUntilNatsClusterIsFormed talks to nats1 via its node IP instead
// of its service name.
func connectDeployCliToNats(pd *pt.PlatformData, nodeIP string) (*nats.Conn, error) {
	seed := pd.Certs.NatsCerts.DeployCliNKeySeed
	if seed == "" {
		return nil, fmt.Errorf("deploy_cli NATS NKey seed is not set on this platform; " +
			"re-run platform credentials setup or upgrade to a version that provisions it")
	}

	kp, err := nkeys.FromSeed([]byte(seed))
	if err != nil {
		return nil, fmt.Errorf("error parsing deploy_cli nkey seed: %w", err)
	}
	pubKey, err := kp.PublicKey()
	if err != nil {
		return nil, fmt.Errorf("error getting deploy_cli public key: %w", err)
	}

	url := fmt.Sprintf("nats://%s:4222", nodeIP)

	domainName := pd.PlatformInfo.DomainName
	tlsCfg := &tls.Config{
		ServerName: domainName,
		MinVersion: tls.VersionTLS12,
	}
	rootCAs, err := x509.SystemCertPool()
	if err != nil || rootCAs == nil {
		rootCAs = x509.NewCertPool()
	}
	tlsCfg.RootCAs = rootCAs

	nc, err := nats.Connect(url,
		nats.Nkey(pubKey, func(nonce []byte) ([]byte, error) {
			return kp.Sign(nonce)
		}),
		nats.Secure(tlsCfg),
		nats.Timeout(10*time.Second),
		nats.MaxReconnects(0), // this is a short-lived admin connection; don't linger retrying
	)
	if err != nil {
		return nil, fmt.Errorf("error connecting to nats1 (%s) as deploy_cli: %w", nodeIP, err)
	}

	return nc, nil
}

// jszResponse mirrors the subset of fields we need from nats1's HTTP
// monitoring endpoint (port 8222), used here purely for discovery. This
// endpoint requires no NATS authentication (it's a separate plain HTTP
// server meant for external monitoring tools) and, unlike the JetStream
// client's StreamNames() API, has proven reliable for inspecting stream
// state throughout this investigation, including in narrow windows right
// after a cluster scale-up.
type jszResponse struct {
	AccountDetails []struct {
		Name         string `json:"name"`
		StreamDetail []struct {
			Name    string `json:"name"`
			Cluster struct {
				Leader   string `json:"leader"`
				Replicas []struct {
					Name string `json:"name"`
				} `json:"replicas"`
			} `json:"cluster"`
		} `json:"stream_detail"`
	} `json:"account_details"`
}

// streamDiscovery holds what we learn about a stream from nats1's HTTP
// monitoring endpoint: its name, how many replica peers it currently has
// (1 + len(peerNames), used by the scale-up path to skip streams already
// at or above the target replica count), the names of those peers (used
// by the scale-down path to know which peers to explicitly remove), and
// its current leader (used by the scale-down path to know whether a
// leader stepdown is needed before reducing Replicas).
type streamDiscovery struct {
	name           string
	currentReplica int      // 1 (this node) + len(peerNames)
	peerNames      []string // names of the OTHER replica peers (not including the node we queried)
	leader         string
}

// listStreamsViaMonitoring fetches the current stream list from nats1's
// HTTP monitoring endpoint, across all accounts (we only care about APP
// in practice, but streams could in principle exist elsewhere), along
// with each stream's currently observed replica peers and leader.
func listStreamsViaMonitoring(nodeIP string) ([]streamDiscovery, error) {
	url := fmt.Sprintf("http://%s:8222/jsz?streams=true&accounts=true", nodeIP)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("error fetching %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading jsz response: %w", err)
	}

	var parsed jszResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("error parsing jsz response: %w", err)
	}

	var streams []streamDiscovery
	for _, account := range parsed.AccountDetails {
		for _, stream := range account.StreamDetail {
			peerNames := make([]string, 0, len(stream.Cluster.Replicas))
			for _, peer := range stream.Cluster.Replicas {
				peerNames = append(peerNames, peer.Name)
			}
			streams = append(streams, streamDiscovery{
				name:           stream.Name,
				currentReplica: 1 + len(peerNames),
				peerNames:      peerNames,
				leader:         stream.Cluster.Leader,
			})
		}
	}

	return streams, nil
}

// apiError mirrors the standard JetStream API error shape, as already
// observed throughout this investigation (e.g. "code=404 err_code=10059
// description=stream not found").
type apiError struct {
	Code        int    `json:"code"`
	ErrCode     int    `json:"err_code"`
	Description string `json:"description"`
}

// streamLeaderStepDownPlacement/Request are the JSON payload for
// $JS.API.STREAM.LEADER.STEPDOWN.<stream>. See JSApiLeaderStepdownRequest
// and the Placement struct in the nats-server source — Placement.Preferred
// takes a server *name* (e.g. "nats1"), which the server resolves to the
// matching peer ID internally.
type streamLeaderStepDownPlacement struct {
	Preferred string `json:"preferred,omitempty"`
}

type streamLeaderStepDownRequest struct {
	Placement *streamLeaderStepDownPlacement `json:"placement,omitempty"`
}

// streamLeaderStepDownResponse is the JSON response shape for a leader
// stepdown request. See JSApiStreamLeaderStepDownResponse in the
// nats-server source.
type streamLeaderStepDownResponse struct {
	Error   *apiError `json:"error,omitempty"`
	Success bool      `json:"success,omitempty"`
}

// ensureNats1IsStreamLeader makes sure nats1 is the current leader of the
// given stream, requesting a leader stepdown (with nats1 as the preferred
// new leader) if it isn't, and waiting for the monitoring endpoint to
// confirm the change before returning.
//
// Why this is needed: reducing a stream's Replicas keeps whichever peer
// currently leads it; it does not let the caller pick which peer survives.
// Since this platform always keeps nats1 and removes higher-numbered nats
// nodes, nats1 must be the leader *before* Replicas is reduced, or the
// surviving copy could end up on a node about to be torn down.
func ensureNats1IsStreamLeader(nc *nats.Conn, nodeIP string, streamName string, currentLeader string) error {
	const (
		thisNodeName  = "nats1"
		pollInterval  = 1 * time.Second
		stepDownWait  = 15 * time.Second
		requestWindow = 10 * time.Second
	)

	if currentLeader == thisNodeName {
		return nil
	}

	payload, err := json.Marshal(streamLeaderStepDownRequest{
		Placement: &streamLeaderStepDownPlacement{Preferred: thisNodeName},
	})
	if err != nil {
		return fmt.Errorf("error encoding leader stepdown request: %w", err)
	}

	subject := fmt.Sprintf("$JS.API.STREAM.LEADER.STEPDOWN.%s", streamName)
	msg, err := nc.Request(subject, payload, requestWindow)
	if err != nil {
		return fmt.Errorf("error requesting leader stepdown: %w", err)
	}

	var resp streamLeaderStepDownResponse
	if err := json.Unmarshal(msg.Data, &resp); err != nil {
		return fmt.Errorf("error parsing leader stepdown response: %w", err)
	}
	if resp.Error != nil {
		return fmt.Errorf("error requesting leader stepdown: code=%d err_code=%d description=%s",
			resp.Error.Code, resp.Error.ErrCode, resp.Error.Description)
	}
	if !resp.Success {
		return fmt.Errorf("leader stepdown request did not report success")
	}

	// Stepdown is asynchronous — success here only means the process
	// started. Poll the monitoring endpoint until nats1 is confirmed as
	// leader (or we give up).
	deadline := time.Now().Add(stepDownWait)
	for time.Now().Before(deadline) {
		streams, err := listStreamsViaMonitoring(nodeIP)
		if err == nil {
			for _, s := range streams {
				if s.name == streamName && s.leader == thisNodeName {
					return nil
				}
			}
		}
		time.Sleep(pollInterval)
	}

	return fmt.Errorf("nats1 did not become leader within %s after requesting stepdown", stepDownWait)
}

// reduceNatsStreamsReplicas lowers every stream's Replicas to
// targetReplicas (typically 1), ensuring nats1 is each stream's leader
// first so its copy is the one that survives.
//
// Why this exists: scaling NATS down (e.g. 3 -> 1 replicas) used to wipe
// nats1's entire JetStream store (rm -rf /data/nats/jetstream) before
// reconfiguring it as standalone. That avoided nats1 getting stuck
// waiting indefinitely for raft peers (nats2/nats3) that were about to be
// removed, but it discarded every stream's data unconditionally, even
// though nats1 already held a complete, up-to-date copy as one of the
// stream's replicas.
//
// The straightforward-sounding alternative — explicitly removing nats2
// and nats3 as peers (stream-level "peer-remove") before tearing down
// their containers — does not work here: JetStream's peer-remove tries to
// *replace* the removed peer with another available node to keep the
// stream's configured Replicas count, and fails with "peer remap failed"
// (err_code=10059... 10075) when, as in our case, there's no other node
// to remap to. The correct sequence is the other way around: first make
// sure nats1 leads the stream (see ensureNats1IsStreamLeader), then
// reduce Replicas via CreateOrUpdateStream/CreateOrUpdateKeyValue — the
// same call already confirmed to work for the scale-up path — which
// keeps the current leader's copy as the stream shrinks. Only after this
// succeeds for every stream is it safe to remove the nats2/nats3 services
// and reconfigure nats1 as standalone without wiping its disk.
//
// Unlike the scale-up replica migration (which is best-effort), this is
// mandatory: scaling down proceeds with removing the nats2/nats3
// containers immediately afterward, so a stream that wasn't successfully
// reduced here would lose its data once those containers are gone.
// Callers should treat a non-nil error as a reason to abort the
// scale-down rather than continue.
func reduceNatsStreamsReplicas(pd *pt.PlatformData, dc *pt.DockerClient, targetReplicas int) error {
	nodeIP, err := getNats1NodeIP(dc)
	if err != nil {
		return fmt.Errorf("error getting nats1 node IP: %w", err)
	}

	streams, err := listStreamsViaMonitoring(nodeIP)
	if err != nil {
		return fmt.Errorf("error discovering streams: %w", err)
	}
	if len(streams) == 0 {
		return nil
	}

	nc, err := connectDeployCliToNats(pd, nodeIP)
	if err != nil {
		return err
	}
	defer nc.Drain()

	js, err := jetstream.New(nc)
	if err != nil {
		return fmt.Errorf("error getting JetStream context: %w", err)
	}

	const kvBucketNamePrefix = "KV_" // matches the convention NATS itself uses internally for KV-backed streams

	var reduced []string

	for _, s := range streams {
		if s.currentReplica <= targetReplicas {
			continue
		}

		if err := ensureNats1IsStreamLeader(nc, nodeIP, s.name, s.leader); err != nil {
			return fmt.Errorf("%s: error ensuring nats1 is leader before reducing replicas: %w", s.name, err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		var opErr error
		if strings.HasPrefix(s.name, kvBucketNamePrefix) {
			bucket := strings.TrimPrefix(s.name, kvBucketNamePrefix)
			_, opErr = js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
				Bucket:   bucket,
				Replicas: targetReplicas,
			})
		} else {
			_, opErr = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
				Name:     s.name,
				Replicas: targetReplicas,
			})
		}
		cancel()

		if opErr != nil {
			return fmt.Errorf("%s: error reducing replicas: %w", s.name, opErr)
		}

		reduced = append(reduced, s.name)
	}

	if len(reduced) > 0 {
		fmt.Printf("Reduced %d NATS stream(s) to %d replica(s):\n", len(reduced), targetReplicas)
		for _, name := range reduced {
			fmt.Printf("  - %s\n", name)
		}
	}

	return nil
}