// Package snapshot reads and writes osi4iot_snapshot.zip, the portable
// bundle that carries everything needed to stand the same platform up
// somewhere else: the state file, the NATS JetStream backups and the
// wal-g backups of both Patroni clusters.
//
// It is deliberately transport-agnostic. Nothing here talks to NATS,
// S3, MinIO or Docker — callers hand it bytes and readers, and it hands
// bytes and readers back. That keeps the format testable on its own and
// keeps `osi4iot backup snapshot` (which fills a bundle from the object
// store) and `osi4iot init --snapshot-file` (which drains one back into
// a new object store) from having to agree on anything except this
// package.
//
// # Layout
//
//	osi4iot_snapshot.zip
//	├── manifest.json                       what is inside, and where it came from
//	├── README.txt                          written for whoever opens the zip by hand
//	├── state/
//	│   ├── osi4iot_state.json              ENCRYPTED, byte for byte as it sits on disk
//	│   └── nodes.json                      plain, editable: the bit that changes per machine
//	├── nats_streams/<run>/<stream>.tar.gz
//	├── patroni_admin/{basebackups_005,wal_005}/...
//	└── patroni_metrics/{basebackups_005,wal_005}/...
//
// # Why the state file stays encrypted and nodes.json does not
//
// osi4iot_state.json holds the NATS issuer seed, the SSH private keys,
// the ACME account key, every password the deployment uses, and
// WALG_LIBSODIUM_KEY — which is the key the Patroni backups sitting in
// this same zip are encrypted with. A bundle with that in the clear is
// the whole platform in one file, and this file travels: scp, a USB
// stick, someone's Downloads folder.
//
// The only part an operator actually needs to edit when moving to other
// hardware is the nodes, so that part, and only that part, is lifted
// out into nodes.json in plain text. Edit it, and
// `osi4iot init --snapshot-file` overlays it onto the decrypted state
// file before writing the file out locally. See nodes.go.
//
// Node passwords are never exported into nodes.json even though
// NodeData carries them — see ExtractNodes.
//
// # Object entries are stored, not deflated
//
// Everything under the target directories is already compressed
// (wal-g's lz4 or brotli, and gzip for the NATS snapshots) and, for
// wal-g, encrypted on top. Re-deflating it costs CPU and saves nothing,
// so object entries go in with zip.Store. manifest.json, nodes.json and
// README.txt are small and are deflated normally.
//
// archive/zip switches to zip64 on its own once an entry or the archive
// passes the 4 GiB mark, which a full Patroni base backup will.
package snapshot

// Format version of the bundle layout. Bumped when the on-disk shape
// changes in a way an older CLI cannot read. Reader.Open refuses
// anything newer than this, because the alternative is a confusing
// failure halfway through a restore.
const FormatVersion = 1

// Fixed paths inside the archive.
const (
	ManifestPath = "manifest.json"
	ReadmePath   = "README.txt"

	// StatePath keeps the name the file has on disk, encrypted form and
	// all. The extension is a small lie in both places, and being
	// consistent about it beats inventing a second convention here.
	StatePath = "state/osi4iot_state.json"

	// NodesPath is the editable overlay. See nodes.go.
	NodesPath = "state/nodes.json"
)
