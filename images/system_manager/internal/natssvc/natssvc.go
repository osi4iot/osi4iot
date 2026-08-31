// Package natssvc exposes every task.Task passed to Run as a NATS
// request-reply endpoint — backups, cert renewal, and anything added to
// main.go's task list after them — authenticated via the shared NKey
// identity every connection in this service uses (see
// internal/natsconn; auth_callout's infra.go grants that NKey:
// subscribe under system_manager.>, deny publish, allow one response
// per request via jwt.ResponsePermission, PLUS the JetStream-admin
// permissions internal/nats_backup needs — that grant must be widened
// there whenever a task with a genuinely new subject prefix or NATS
// capability is added here, unless it's already scoped to the whole
// system_manager.> tree).
//
// A request's body, if any, is JSON-decoded into a plain map and passed
// straight through to the task's Run — see task.Task.Run's doc comment.
// It's entirely optional, and lenient: a request with no body, or with
// a body that isn't a JSON object (invalid JSON, or valid JSON of the
// wrong shape — an array, a bare string, ...), both resolve to the same
// nil params rather than being rejected — see decodeParams.
//
// Every Run this package triggers goes through the shared taskpool.Pool
// passed to Run, with priority over anything schedule.Loop has waiting
// for the same slots — see internal/taskpool.
//
// Docker's own healthcheck is unaffected by this — it still hits a small
// HTTP /health endpoint (see cmd/system_manager/main.go), unrelated to
// this package.
package natssvc

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/nats-io/nats.go/micro"

	"system_manager/internal/natsconn"
	"system_manager/internal/task"
	"system_manager/internal/taskpool"
)

// Config is natsconn.Config directly — natssvc needs nothing beyond how
// to connect to NATS, and reuses the exact same connection every other
// task in this service does (see internal/natsconn's package doc
// comment for why there's only one shared identity now).
type Config = natsconn.Config

// LoadConfig reads the NATS connection/credential configuration from
// the environment. See natsconn.LoadConfig.
func LoadConfig() Config {
	return natsconn.LoadConfig()
}

// Run connects to NATS, registers one request-reply endpoint per task
// under "system_manager.<task.Subject()>" — dots in Subject become
// nested groups, so a Target with Subject "patroni.trigger_backup.admin"
// ends up reachable at "system_manager.patroni.trigger_backup.admin" —
// and blocks until ctx is cancelled. Each request synchronously runs
// that task's Run and replies with its output — success or failure — so
// the caller (primarily the platform CLI) knows the actual outcome, not
// just that the request was received. pool bounds how many Runs (from
// here and from schedule.Loop) can be in flight at once, with requests
// arriving here given priority over scheduled runs waiting for the same
// slots — see internal/taskpool.
func Run(ctx context.Context, cfg Config, tasks []task.Task, pool *taskpool.Pool) error {
	nc, err := natsconn.Connect(cfg)
	if err != nil {
		return err
	}
	defer nc.Drain()
	log.Printf("[nats] connected to %s", cfg.ServersURL)

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
		if err := registerTask(ctx, root, t, pool); err != nil {
			return err
		}
	}

	log.Println("[nats] system_manager NATS service is running")
	<-ctx.Done()
	return nil
}

// registerTask mounts t under g at the subject path given by t.Subject()
// — "patroni.trigger_backup.admin" becomes g/patroni/trigger_backup,
// with "admin" as the endpoint name — so an arbitrarily deep subject
// hierarchy just falls out of each task naming itself, without this
// package needing to know about backups, certs, or anything added
// after them. Requests run t
// against the long-lived ctx passed to Run (the process lifetime), the
// same as a scheduled run would, so an in-flight manual trigger is
// cancelled cleanly on shutdown rather than left dangling.
func registerTask(ctx context.Context, g micro.Group, t task.Task, pool *taskpool.Pool) error {
	parts := strings.Split(t.Subject(), ".")
	if len(parts) == 0 || parts[len(parts)-1] == "" {
		return fmt.Errorf("invalid task subject %q", t.Subject())
	}
	group, endpoint := g, parts[len(parts)-1]
	for _, p := range parts[:len(parts)-1] {
		group = group.AddGroup(p)
	}

	return group.AddEndpoint(endpoint, micro.HandlerFunc(func(req micro.Request) {
		data := req.Data()
		params := decodeParams(data)
		if params == nil && len(data) > 0 {
			log.Printf("[nats] %s: request body isn't a JSON object, ignoring it", t.Subject())
		}

		log.Printf("[nats] %s: trigger requested", t.Subject())

		release, err := pool.AcquireManual(ctx)
		if err != nil {
			log.Printf("[nats] %s: not run: %v", t.Subject(), err)
			if respErr := req.Error("503", "server shutting down before a task pool slot was free", nil); respErr != nil {
				log.Printf("[nats] %s: error replying: %v", t.Subject(), respErr)
			}
			return
		}
		defer release()

		output, err := t.Run(ctx, params)
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

// decodeParams JSON-decodes data into a plain map, for Task.Run's
// optional params argument. Anything that isn't a JSON object at the
// top level — no body at all, invalid JSON, or valid JSON that just
// isn't an object (an array, a bare string like json.Marshal("") would
// produce, a number, ...) — resolves to nil, the exact same value a
// request with no body at all produces, rather than rejecting the
// request.
//
// This used to be stricter (a non-object body was a 400), on the
// reasoning that silently accepting it could mask a caller's mistake.
// In practice a caller marshaling something other than an object —
// json.Marshal("") is a real example that came up — is a normal enough
// pattern that rejecting it did more harm than good: params is optional
// and forward-looking (see Task.Run's doc comment), and today NO task
// reads it at all, so a value nothing downstream even uses yet isn't
// worth a hard failure over its shape. Once some task actually depends
// on a specific param, validating IT belongs in that task's own Run,
// where the error can name the field that's actually wrong — not here,
// where all this could ever say is "not an object".
func decodeParams(data []byte) map[string]any {
	if len(data) == 0 {
		return nil
	}
	var params map[string]any
	if err := json.Unmarshal(data, &params); err != nil {
		return nil
	}
	return params
}
