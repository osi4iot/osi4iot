package certrenewer

import (
	"context"
	"errors"
	"fmt"
	"log"

	"system_manager/internal/certstore"
	"system_manager/internal/task"
)

// Exporter hands the stored certificate material back to the platform
// CLI on demand (Punto 3). It exists because renewal now happens HERE,
// not in the CLI: once system_manager rolls a new certificate, the CLI's
// osi4iot_state.json still holds the day-one one, so `osi4iot certs
// check` reports a stale expiry and a later `osi4iot init` would push
// stale material back into the swarm's secrets. The CLI calls this,
// decrypts the reply, and writes the result into its own PlatformData.
//
// The reply is the ciphertext exactly as stored — see
// certstore.Store.LoadRaw. The CLI generated PLATFORM_ENCRYPTION_KEY in
// the first place and keeps it in its (encrypted) state file, so it can
// derive the same subkey and decrypt without this service ever putting
// the domain's private key on the wire in the clear. The NATS connection is TLS and the subject is
// permissioned, so this is defence in depth rather than the only
// barrier — but it also means a mis-scoped subscription elsewhere in the
// platform leaks an opaque blob rather than a usable key.
//
// It is on-demand only: it implements task.Task but NOT task.Scheduled,
// like patroni.LeaderQuery and nats_backup's restore, so main appends it
// to tasks and never to scheduled.
type Exporter struct {
	store *certstore.Store
}

var _ task.Task = (*Exporter)(nil)

// NewExporter returns the export task backed by store.
func NewExporter(store *certstore.Store) *Exporter {
	return &Exporter{store: store}
}

// Subject identifies this task for NATS routing, reachable at
// "system_manager.certs.export". auth_callout's infra.go must grant the
// deploy_cli NKey publish permission on that exact subject (it already
// has it for system_manager.certs.renew if the CLI triggers renewals) —
// system_manager's own NKey already subscribes to system_manager.>, so
// nothing changes on that side.
func (e *Exporter) Subject() string { return "certs.export" }

// Run returns the stored, still-encrypted certificate blob. params is
// unused. An empty volume is reported as a plain error rather than an
// empty success, so the CLI can tell "system_manager has nothing" apart
// from "system_manager has nothing NEW" — with the seed secret in place
// (Punto 4) an empty volume means something went wrong with seeding.
func (e *Exporter) Run(ctx context.Context, params map[string]any) (string, error) {
	blob, err := e.store.LoadRaw()
	if errors.Is(err, certstore.ErrNoState) {
		return "", errors.New("no certificates stored in the system_manager volume yet")
	}
	if err != nil {
		return "", fmt.Errorf("reading stored certificates: %w", err)
	}
	log.Printf("[certs] exporting stored certificates (%d bytes of ciphertext)", len(blob))
	return string(blob), nil
}