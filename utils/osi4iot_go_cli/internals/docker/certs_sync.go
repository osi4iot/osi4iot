package docker

import (
	"encoding/json"
	"errors"
	"fmt"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// SyncCertsFromSystemManager brings pd.Certs.DomainCerts up to date with
// whatever system_manager holds, and reports whether anything changed
// and where the material came from ("" when there was nothing to read).
//
// It does NOT write the state file: createSwarmServices calls it as one
// step of a longer flow, and `osi4iot certs download` persists
// explicitly afterwards.
//
// Two sources, in this order:
//
//  1. A NATS request to system_manager, when the service is actually
//     running — the normal case on a live platform.
//
//  2. The volume directly, when it isn't. This is what makes the
//     function safe to call from the deployment path, where NATS does
//     not exist yet and a request would only hang until it timed out.
//     See ReadCertsBlobFromVolume.
//
// Finding nothing is a normal outcome, not an error: on a brand-new
// platform the CLI is the only source of certificates there is. The
// value is on every SUBSEQUENT deployment, where it stops the CLI from
// pushing the certificate frozen in osi4iot_state.json over the fresher
// one system_manager renewed on its own schedule.
//
// It never downgrades: a remote certificate that expires no later than
// the local one is ignored, so calling this repeatedly, or on a platform
// where the CLI happens to hold the newer material, is harmless.
func SyncCertsFromSystemManager(pd *pt.PlatformData, dc *pt.DockerClient) (bool, string, error) {
	if pd.PlatformInfo.DomainCertsType != "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		return false, "", nil
	}
	if pd.PlatformInfo.PlatformEncryptionKey == "" {
		// A platform created before encrypted certificate storage
		// existed. Nothing to read, and nothing broken — the CLI stays
		// the authority.
		return false, "", nil
	}

	blob, source, err := fetchCertsBlob(pd, dc)
	if err != nil {
		return false, "", err
	}
	if blob == "" {
		return false, "", nil
	}

	plain, err := utils.DecryptWithPlatformKey(pd.PlatformInfo.PlatformEncryptionKey, utils.PurposeDomainCerts, blob)
	if err != nil {
		return false, source, fmt.Errorf("error decrypting the certificates from %s: %w", source, err)
	}

	var remote pt.DomainCerts
	if err := json.Unmarshal(plain, &remote); err != nil {
		return false, source, fmt.Errorf("error parsing the certificates from %s: %w", source, err)
	}
	if remote.SslCertCrt == "" || remote.PrivateKey == "" {
		return false, source, fmt.Errorf("%s returned certificates with no key or certificate material", source)
	}

	localExpiry := certsExpirationTimestamp(pd.Certs.DomainCerts)
	remoteExpiry := certsExpirationTimestamp(remote)
	if remoteExpiry != 0 && localExpiry != 0 && remoteExpiry <= localExpiry {
		return false, source, nil
	}

	pd.Certs.DomainCerts = remote
	return true, source, nil
}

// fetchCertsBlob returns the encrypted blob and a label for where it
// came from, or ("", "", nil) when nothing is stored anywhere.
func fetchCertsBlob(pd *pt.PlatformData, dc *pt.DockerClient) (string, string, error) {
	if IsSystemManagerRunning(dc) {
		blob, err := RequestCertsExport(pd, dc)
		if err == nil {
			return blob, "system_manager", nil
		}
		// Running but unreachable: a broken NATS connection, a missing
		// auth_callout grant, a task still starting. The volume is right
		// there either way, so say what happened and read that rather
		// than failing.
		fmt.Printf("Warning: could not reach system_manager over NATS (%v) — reading its volume directly\n", err)
	}

	blob, err := ReadCertsBlobFromVolume(pd)
	if errors.Is(err, ErrNoStoredCerts) {
		return "", "", nil
	}
	if err != nil {
		return "", "", fmt.Errorf("error reading the system_manager volume: %w", err)
	}
	return blob, "the system_manager volume", nil
}

// PushCertsToVolume encrypts pd's current certificates and writes them
// into system_manager's volume, for when the CLI renewed locally while
// the platform was down. See WriteCertsBlobToVolume for when that is
// the right thing to do.
func PushCertsToVolume(pd *pt.PlatformData) error {
	if pd.PlatformInfo.PlatformEncryptionKey == "" {
		return nil
	}
	plain, err := json.Marshal(pd.Certs.DomainCerts)
	if err != nil {
		return fmt.Errorf("error encoding domain certs: %w", err)
	}
	blob, err := utils.EncryptWithPlatformKey(pd.PlatformInfo.PlatformEncryptionKey, utils.PurposeDomainCerts, plain)
	if err != nil {
		return fmt.Errorf("error encrypting domain certs: %w", err)
	}
	return WriteCertsBlobToVolume(pd, blob)
}

// certsExpirationTimestamp returns the earlier of the CA and leaf
// expiration timestamps, or 0 when either is unset — the same rule
// utils.GetCertsExpirationInfo and system_manager's
// certstore.DaysToExpiry use.
func certsExpirationTimestamp(dc pt.DomainCerts) int64 {
	if dc.CaPemExpirationTimestamp <= 0 || dc.CertCrtExpirationTimestamp <= 0 {
		return 0
	}
	return min(dc.CaPemExpirationTimestamp, dc.CertCrtExpirationTimestamp)
}
