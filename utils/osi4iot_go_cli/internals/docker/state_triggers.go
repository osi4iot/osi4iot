package docker

import (
	"encoding/json"
	"fmt"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file backs `osi4iot state`. Like backup_triggers.go and
// certs_triggers.go, everything here is a thin wrapper around
// requestSystemManager — the work happens in system_manager's
// internal/statefile.
//
// What travels over NATS is always ciphertext, and it is the state file
// exactly as it sits on disk — already encrypted by internals/crypto
// under the operator's passphrase. Nothing here re-encrypts anything;
// system_manager stores bytes it has no key for. That matters more here
// than anywhere else in this package: the state file holds every
// credential the platform has.

// stateFileTimeout bounds a state-file request. All three tasks are one
// small S3 object each, so this is generous already — the objects are
// kilobytes, not the tarballs nats_backup moves around.
const stateFileTimeout = 60 * time.Second

// StateFileMaxPayload is the largest encrypted state file the CLI will
// try to send.
//
// The limit is NATS's, not ours: max_payload defaults to 1 MB and this
// platform's server config doesn't raise it, so a bigger request is
// rejected by the server with an error that says nothing about state
// files. Checking here means the operator gets told what actually
// happened. State files are normally a few KB; they get large when
// GeoJSON floor plans are embedded in them (see
// MainOrganizationBuilding / MainOrganizationFirstFloor), which is the
// realistic way to hit this.
const StateFileMaxPayload = 900 << 10 // 900 KiB, leaving room for the JSON envelope

// BackupStateFile hands system_manager an encrypted copy of the state
// file to store in S3, and returns its summary of where it went.
func BackupStateFile(pd *pt.PlatformData, dc *pt.DockerClient, blob string) (string, error) {
	if len(blob) > StateFileMaxPayload {
		return "", fmt.Errorf("the encrypted state file is %d KB, over the %d KB NATS payload limit",
			len(blob)/1024, StateFileMaxPayload/1024)
	}

	payload, err := json.Marshal(map[string]string{"state": blob})
	if err != nil {
		return "", fmt.Errorf("error encoding the request: %w", err)
	}

	data, err := requestSystemManager(pd, dc, "system_manager.state_file.backup", stateFileTimeout, payload)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// RestoreStateFile fetches a stored state file — the newest one, or the
// run named by `run` — and returns it still encrypted, exactly as it
// was stored.
func RestoreStateFile(pd *pt.PlatformData, dc *pt.DockerClient, run string) (string, error) {
	var payload []byte
	if run != "" {
		var err error
		payload, err = json.Marshal(map[string]string{"run": run})
		if err != nil {
			return "", fmt.Errorf("error encoding the request: %w", err)
		}
	}

	data, err := requestSystemManager(pd, dc, "system_manager.state_file.restore", stateFileTimeout, payload)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ListStateFileBackups returns the names of the stored runs, newest
// first, as system_manager's statefile.List reports them.
func ListStateFileBackups(pd *pt.PlatformData, dc *pt.DockerClient) ([]string, error) {
	data, err := requestSystemManager(pd, dc, "system_manager.state_file.list", stateFileTimeout, nil)
	if err != nil {
		return nil, err
	}

	var runs []string
	if err := json.Unmarshal(data, &runs); err != nil {
		return nil, fmt.Errorf("error parsing the run list: %w", err)
	}
	return runs, nil
}
