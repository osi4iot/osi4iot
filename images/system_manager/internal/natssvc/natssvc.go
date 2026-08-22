// Package natssvc exposes every task.Task passed to Run as a NATS
// request-reply endpoint — backups, cert renewal, and anything added to
// main.go's task list after them — authenticated via NKey, the same
// infra-service pattern used by vector/admin_api/pipelines/deploy_cli
// (see auth_callout's infra.go for the permissions granted to this
// NKey: subscribe under system_manager.>, deny publish, allow one
// response per request via jwt.ResponsePermission — that grant must be
// widened there whenever a task with a genuinely new subject prefix is
// added here, unless it's already scoped to the whole system_manager.>
// tree).
//
// The NATS server's main listener (4222) always requires TLS, even for
// in-swarm clients — see nats_config's configTemplate — so this
// connects with nats.Secure(...) unconditionally, not just for external
// clients.
//
// Docker's own healthcheck is unaffected by this — it still hits a small
// HTTP /health endpoint (see cmd/system_manager/main.go), unrelated to
// this package.
package natssvc

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"strings"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/micro"
	"github.com/nats-io/nkeys"

	"system_manager/internal/config"
	"system_manager/internal/task"
)

// Config holds the NATS connection details and NKey credentials.
type Config struct {
	serversURL string
	domainName string
	nkeySeed   string
}

// LoadConfig reads the NATS connection/credential configuration from the
// environment. serversURL is already a comma-joined multi-server string
// (see secrets.NatsSeedServers) — passed straight through to
// nats.Connect, which accepts that format directly.
func LoadConfig() Config {
	return Config{
		serversURL: config.MustEnv("NATS_SEED_SERVERS_URL"),
		domainName: config.MustEnv("DOMAIN_NAME"),
		nkeySeed:   config.MustEnv("NATS_NKEY_SEED"),
	}
}

// Run connects to NATS, registers one request-reply endpoint per task
// under "system_manager.<task.Subject()>" — dots in Subject become
// nested groups, so a Target with Subject "backup.patroni.admin" ends up
// reachable at "system_manager.backup.patroni.admin" — and blocks until
// ctx is cancelled. Each request synchronously runs that task's Run and
// replies with its output — success or failure — so the caller
// (primarily the platform CLI) knows the actual outcome, not just that
// the request was received.
func Run(ctx context.Context, cfg Config, tasks []task.Task) error {
	kp, err := nkeys.FromSeed([]byte(cfg.nkeySeed))
	if err != nil {
		return fmt.Errorf("parsing NKey seed: %w", err)
	}
	pubKey, err := kp.PublicKey()
	if err != nil {
		return fmt.Errorf("deriving NKey public key: %w", err)
	}

	tlsCfg := &tls.Config{
		ServerName: cfg.domainName,
		MinVersion: tls.VersionTLS12,
	}
	rootCAs, err := x509.SystemCertPool()
	if err != nil || rootCAs == nil {
		rootCAs = x509.NewCertPool()
	}
	tlsCfg.RootCAs = rootCAs

	nc, err := nats.Connect(cfg.serversURL,
		nats.Nkey(pubKey, kp.Sign),
		nats.Secure(tlsCfg),
	)
	if err != nil {
		return fmt.Errorf("connecting to NATS at %s: %w", cfg.serversURL, err)
	}
	defer nc.Drain()
	log.Printf("[nats] connected to %s as %s", cfg.serversURL, pubKey)

	srv, err := micro.AddService(nc, micro.Config{
		Name:        "system_manager",
		Version:     "1.0.0",
		Description: "On-demand triggers for system_manager's maintenance tasks.",
	})
	if err != nil {
		return fmt.Errorf("registering NATS service: %w", err)
	}

	root := srv.AddGroup("system_manager")
	for _, t := range tasks {
		if err := registerTask(ctx, root, t); err != nil {
			return err
		}
	}

	log.Println("[nats] system_manager NATS service is running")
	<-ctx.Done()
	return nil
}

// registerTask mounts t under g at the subject path given by t.Subject()
// — "backup.patroni.admin" becomes g/backup/patroni, with "admin" as the
// endpoint name — so an arbitrarily deep subject hierarchy just falls
// out of each task naming itself, without this package needing to know
// about backups, certs, or anything added after them. Requests run t
// against the long-lived ctx passed to Run (the process lifetime), the
// same as a scheduled run would, so an in-flight manual trigger is
// cancelled cleanly on shutdown rather than left dangling.
func registerTask(ctx context.Context, g micro.Group, t task.Task) error {
	parts := strings.Split(t.Subject(), ".")
	if len(parts) == 0 || parts[len(parts)-1] == "" {
		return fmt.Errorf("invalid task subject %q", t.Subject())
	}
	group, endpoint := g, parts[len(parts)-1]
	for _, p := range parts[:len(parts)-1] {
		group = group.AddGroup(p)
	}

	return group.AddEndpoint(endpoint, micro.HandlerFunc(func(req micro.Request) {
		log.Printf("[nats] %s: trigger requested", t.Subject())
		output, err := t.Run(ctx)
		if err != nil {
			log.Printf("[nats] %s: FAILED: %v", t.Subject(), err)
			if respErr := req.Error("500", err.Error(), []byte(output)); respErr != nil {
				log.Printf("[nats] %s: error replying: %v", t.Subject(), respErr)
			}
			return
		}
		log.Printf("[nats] %s: OK", t.Subject())
		if respErr := req.Respond([]byte(output)); respErr != nil {
			log.Printf("[nats] %s: error replying: %v", t.Subject(), respErr)
		}
	}))
}
