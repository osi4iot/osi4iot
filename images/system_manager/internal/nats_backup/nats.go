package nats_backup

import (
	"github.com/nats-io/nats.go"

	"system_manager/internal/natsconn"
)

// connect opens a NATS connection using the shared identity every
// connection in this service authenticates as — see internal/natsconn.
// Unlike the platform CLI's connectDeployCliToNats (nats_replicas.go),
// which must dial nats1's node IP because the CLI runs as a host binary
// outside the Swarm overlay network, system_manager IS a Swarm service,
// so natsconn.Connect reaches NATS via cfg.nats.ServersURL's
// overlay-resolvable server list over TLS, with no node-IP lookup
// needed. (This assumes system_manager's Swarm service is attached to
// nats_network, the same way it's already reachable for natssvc's own
// connection — see MIGRATION_NOTES.md if that turns out not to be the
// case yet.)
func connect(cfg Config) (*nats.Conn, error) {
	return natsconn.Connect(cfg.nats)
}

// currentNatsReplicas reports the NATS cluster's current size, used by
// Restore to pick the replica count for restored streams when there may
// be no existing stream left to infer it from (that's exactly the
// situation Restore runs in — recovering onto a cluster that just lost
// its data). It reads this off nc itself rather than the Docker/Swarm
// API: nc.Servers() returns every server URL configured AND discovered
// via NATS's own cluster gossip (the INFO protocol), so it reflects the
// live cluster nc is actually connected to — no Docker socket access
// needed, which matters because a NATS_BACKUP_ENABLED-only deployment
// may not have one (unlike CERT_RENEWAL_ENABLED/prune, this task grants
// itself no /var/run/docker.sock access). This assumes
// NATS_SEED_SERVERS_URL is kept in sync with the cluster's actual node
// count (secrets.NatsSeedServers, referenced in natssvc.go, already
// implies it is) — if that ever drifts, prefer querying nats1's /varz
// instead (see nats_replicas.go's listStreamsViaMonitoring for the same
// pattern applied to stream state rather than cluster size).
func currentNatsReplicas(nc *nats.Conn) int {
	if n := len(nc.Servers()); n > 0 {
		return n
	}
	return 1
}
