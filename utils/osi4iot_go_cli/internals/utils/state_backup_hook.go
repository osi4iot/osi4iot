package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// The state file is backed up off-host on every change, and this is the
// seam that makes "on every change" literal instead of aspirational.
// WritePlatformDataToFile is the one and only place the file is
// written, so hooking it catches every path — a deployment, a scale
// up/down, a certificate sync, a manual edit — without every one of
// those call sites having to remember.
//
// It is a registered callback rather than a direct call because of
// import direction: the backup travels over NATS through
// internals/docker, and internals/docker already imports this package.
// Calling it from here directly would be a cycle. The CLI's cmd package
// registers the real implementation at startup (see cmd/state.go); in
// any other build — tests, tooling — the hook is simply nil and writing
// the state file behaves exactly as it did before.

var (
	stateBackupMu       sync.Mutex
	stateBackupHook     func(pd *pt.PlatformData, encoded []byte)
	lastBackedUpDigest  string
	stateBackupDisabled bool
)

// SetStateBackupHook installs the function called after every
// successful write of the state file. Passing nil disables it.
//
// The hook receives both the platform data and the bytes exactly as
// they were written to disk — already encrypted under this machine's
// passphrase. Those bytes ARE the backup: what goes to S3 is a verbatim
// copy of the file, not a re-encryption of it, so there is no second
// crypto path to keep in step with internals/crypto.
func SetStateBackupHook(fn func(pd *pt.PlatformData, encoded []byte)) {
	stateBackupMu.Lock()
	defer stateBackupMu.Unlock()
	stateBackupHook = fn
}

// DisableStateBackup turns the hook off for the rest of the process,
// for the commands that shouldn't trigger one.
//
// `osi4iot state restore` is the case that needs it: it writes the file
// it just downloaded, and re-uploading that as a "new" backup would put
// a duplicate of an old run at the top of the history, making the list
// misleading precisely when someone is trying to work out which version
// to go back to.
func DisableStateBackup() {
	stateBackupMu.Lock()
	defer stateBackupMu.Unlock()
	stateBackupDisabled = true
}

// runStateBackupHook invokes the registered hook, unless nothing has
// actually changed since the last one.
//
// The de-duplication is not an optimization. A single command can write
// the state file several times — a deployment syncs certificates,
// updates node data, and records service data, each with its own write
// — and without this, each one would be a separate NATS round trip and
// a separate near-identical object in S3, pushing genuinely different
// earlier versions out of the retention window for no reason.
func runStateBackupHook(data *pt.PlatformData, plaintext, encoded []byte) {
	stateBackupMu.Lock()
	hook := stateBackupHook
	disabled := stateBackupDisabled
	digest := hex.EncodeToString(sha256Sum(plaintext))
	unchanged := digest == lastBackedUpDigest
	if !disabled && hook != nil && !unchanged {
		lastBackedUpDigest = digest
	}
	stateBackupMu.Unlock()

	if disabled || hook == nil || unchanged {
		return
	}
	hook(data, encoded)
}

func sha256Sum(b []byte) []byte {
	sum := sha256.Sum256(b)
	return sum[:]
}

