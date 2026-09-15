package certrenewer

import (
	"context"
	"errors"
	"log"
	"time"

	"system_manager/internal/certstore"
	"system_manager/internal/dockersvc"
	"system_manager/internal/platform"
)

// Reconcile checks whether traefik/nats are actually serving the
// certificate this service holds, and rolls them over if they aren't.
// See dockersvc.ReconcileCerts for why that can drift.
//
// It is deliberately separate from Run's renewal logic and runs BEFORE
// the expiry check there: the drift it fixes shows up precisely when the
// stored certificate is fine and renewal correctly skips, so folding it
// in after the skip would mean it never ran in the case it exists for.
func (r *Renewer) Reconcile(ctx context.Context) (string, error) {
	stored, err := r.store.Load()
	if errors.Is(err, certstore.ErrNoState) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return r.reconcileWith(ctx, stored)
}

// reconcileWith is Reconcile against certificates the caller has already
// loaded — Run has them in hand and shouldn't read and decrypt the file
// a second time.
func (r *Renewer) reconcileWith(ctx context.Context, stored platform.DomainCerts) (string, error) {
	if certstore.IsEmpty(stored) {
		return "", nil
	}

	r.rollout.Lock()
	defer r.rollout.Unlock()

	cli, err := dockersvc.NewClient()
	if err != nil {
		return "", err
	}
	defer cli.Close()

	return dockersvc.ReconcileCerts(ctx, cli, &platform.PlatformData{
		PlatformInfo: platform.PlatformInfo{DomainName: r.cfg.domainName},
		DomainCerts:  stored,
	})
}

// ReconcileAtStartup runs Reconcile shortly after boot, retrying while
// the rest of the deployment settles.
//
// The startup pass matters because the drift it corrects is created by a
// deployment — the CLI writing cert secrets from a stale state file —
// and the next scheduled renewal check can be up to 24 hours away. A
// platform brought back up after a long stop would otherwise serve an
// expired certificate for a day while holding the valid one on disk.
//
// It retries because system_manager routinely reaches this point before
// traefik and natsN exist: on a fresh `docker stack`-style rollout every
// service is created at once, and ReconcileCerts treats "no cert
// consumers yet" as nothing to do. Giving up on the first pass would
// mean missing exactly the deployment that caused the drift.
//
// Errors are logged, never fatal: a failure here leaves the platform
// running on whatever it was already serving, which is strictly better
// than refusing to start.
func ReconcileAtStartup(ctx context.Context, r *Renewer) {
	const (
		attempts = 10
		interval = 30 * time.Second
	)

	for i := range attempts {
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval):
		}

		summary, err := r.Reconcile(ctx)
		if err != nil {
			log.Printf("[certs] startup reconciliation attempt %d/%d failed: %v", i+1, attempts, err)
			continue
		}
		if summary != "" {
			log.Printf("[certs] %s", summary)
		}
		return
	}
	log.Printf("[certs] startup reconciliation gave up after %d attempts", attempts)
}
