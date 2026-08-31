// Package natsconn is the one place system_manager builds a NATS
// connection. natssvc (registering system_manager's own NATS
// request-reply service) and nats_backup (snapshotting/restoring
// JetStream streams) both call Connect(LoadConfig()) instead of each
// parsing NATS_NKEY_SEED and building its own TLS config — that logic
// used to be duplicated in both packages.
//
// Both now authenticate as the SAME NATS_NKEY_SEED identity.
// auth_callout's infra.go grants that one NKey both the "infra"
// permissions natssvc's request-reply service needs (subscribe under
// system_manager.>) and the JetStream-admin permissions nats_backup
// needs for stream snapshot/restore calls — previously nats_backup used
// a second, dedicated identity (NATS_JETSTREAM_ADMIN_NKEY_SEED) kept
// separate on a least-privilege basis; this platform has since
// consolidated both system_manager identities into one, so that
// variable no longer exists. If a future task needs a narrower grant
// than "everything system_manager can do", reintroducing a second
// identity — not adding more permissions to this one — is the way to
// keep that option open.
package natsconn

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nkeys"

	"system_manager/internal/config"
)

// Config holds what every NATS connection in this service needs: where
// to connect, the TLS ServerName, and the NKey identity to authenticate
// as.
type Config struct {
	// ServersURL is already a comma-joined multi-server string (see
	// secrets.NatsSeedServers) — passed straight through to
	// nats.Connect, which accepts that format directly.
	ServersURL string
	// DomainName doubles as the TLS ServerName for the NATS connection.
	DomainName string
	// NkeySeed is the seed for the single NKey identity every
	// connection in this service authenticates as. See the package doc
	// comment for what it's granted.
	NkeySeed string
}

// LoadConfig reads the shared NATS connection configuration from the
// environment: NATS_SEED_SERVERS_URL, DOMAIN_NAME, NATS_NKEY_SEED.
// Aborts the process (via config.MustEnv) if any is missing —
// entrypoint.sh requires all three unconditionally, since every
// deployment needs at least natssvc's own connection.
func LoadConfig() Config {
	return Config{
		ServersURL: config.MustEnv("NATS_SEED_SERVERS_URL"),
		DomainName: config.MustEnv("DOMAIN_NAME"),
		NkeySeed:   config.MustEnv("NATS_NKEY_SEED"),
	}
}

// Connect opens a NATS connection authenticated as cfg's NKey identity,
// over TLS — the NATS server's main listener (4222) always requires it,
// even for in-swarm clients (see nats_config's configTemplate), so this
// connects with nats.Secure(...) unconditionally, not just for external
// clients. Callers are responsible for nc.Drain()ing the returned
// connection.
func Connect(cfg Config) (*nats.Conn, error) {
	kp, err := nkeys.FromSeed([]byte(cfg.NkeySeed))
	if err != nil {
		return nil, fmt.Errorf("parsing NATS_NKEY_SEED: %w", err)
	}
	pubKey, err := kp.PublicKey()
	if err != nil {
		return nil, fmt.Errorf("deriving NKey public key: %w", err)
	}

	tlsCfg := &tls.Config{
		ServerName: cfg.DomainName,
		MinVersion: tls.VersionTLS12,
	}
	rootCAs, err := x509.SystemCertPool()
	if err != nil || rootCAs == nil {
		rootCAs = x509.NewCertPool()
	}
	tlsCfg.RootCAs = rootCAs

	nc, err := nats.Connect(cfg.ServersURL,
		nats.Nkey(pubKey, kp.Sign),
		nats.Secure(tlsCfg),
	)
	if err != nil {
		return nil, fmt.Errorf("connecting to NATS at %s: %w", cfg.ServersURL, err)
	}
	return nc, nil
}
