package cmd

import (
	"fmt"
	"log"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/certrenewer"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// runCertsUpdate renews the platform's domain certificates.
//
// Renewal has exactly one owner at a time, and which one depends on
// whether the platform is up:
//
//   - system_manager, when it is running. It holds the persistent
//     volume and the daily schedule, so letting the CLI also run ACME
//     would mean two clients with separate accounts and separate state
//     issuing for the same domain against the same Let's Encrypt rate
//     limit.
//
//   - the CLI, when it isn't. On a stopped or half-deployed platform
//     there is nobody to delegate to, and being unable to renew at all
//     is worse than the divergence risk. That path then writes the
//     result into system_manager's volume, so the service doesn't come
//     back up holding older material than the CLI has.
//
// The choice is made from the Docker service state BEFORE issuing
// anything rather than by firing a request and waiting for it to fail:
// the renewal timeout has to cover a Route53 DNS-01 challenge and
// requestSystemManager retries, so "try and see" on a stopped platform
// would mean half an hour of silence.
func runCertsUpdate(logger *log.Logger) error {
	pd := data.GetData()
	if pd.PlatformInfo.DomainName == "" {
		if err := utils.ReadPlatformDataFromFile(pd); err != nil {
			return fmt.Errorf("error reading platform data: %w", err)
		}
	}

	switch pd.PlatformInfo.DomainCertsType {
	case "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider":
	case "Certs provided by an CA":
		return fmt.Errorf("certificate update not supported for type: %s", pd.PlatformInfo.DomainCertsType)
	default:
		return fmt.Errorf("unsupported domain certs type: %s", pd.PlatformInfo.DomainCertsType)
	}

	// GetManagerDC failing is not fatal here: a stopped platform still
	// has a state file to renew from, it just has nowhere to delegate
	// to and nothing to roll the result out to.
	dc, dcErr := docker.GetManagerDC()

	// Check expiry against the freshest certificate that exists
	// anywhere, not against whatever the state file happens to hold. If
	// system_manager renewed last week, the local copy is stale and
	// this would otherwise report an expiry months out of date — and
	// then renew something that doesn't need renewing.
	if dcErr == nil {
		if updated, source, err := docker.SyncCertsFromSystemManager(pd, dc); err != nil {
			return err
		} else if updated {
			logger.Printf("Picked up newer certificates from %s.", source)
			if err := utils.WritePlatformDataToFile(pd); err != nil {
				return fmt.Errorf("error saving platform data: %w", err)
			}
		}
	}

	expirationInfo, err := utils.GetCertsExpirationInfo(pd)
	if err != nil {
		logger.Printf("Could not determine current expiration (%v) — proceeding with renewal to be safe.", err)
	} else if expirationInfo.DaysToExpiry > 15 {
		logger.Printf("Certificates are not close to expiration (%d days to expiry).", expirationInfo.DaysToExpiry)
		return nil
	}

	if dcErr == nil && docker.IsSystemManagerRunning(dc) {
		logger.Printf("Asking system_manager to renew...")
		output, err := docker.TriggerCertsRenewal(pd, dc)
		if err == nil {
			if output != "" {
				logger.Printf("system_manager: %s", output)
			}
			// system_manager rolled the new certificate out to
			// traefik/natsN itself; all that is left is bringing this
			// CLI's state file back in sync.
			return runCertsDownload(logger)
		}
		logger.Printf("system_manager could not renew (%v) — renewing from the CLI instead.", err)
	} else {
		logger.Printf("system_manager is not running — renewing from the CLI.")
	}

	return runCertsUpdateLocally(pd, dc, logger)
}

// runCertsUpdateLocally is the pre-system_manager renewal path: ACME
// from the CLI, then rolling the swarm secrets over. See runCertsUpdate
// for when it still runs.
//
// Whatever it obtains is also pushed into system_manager's volume.
// Without that, a renewal done while the platform was down would leave
// the volume holding the older certificate, and system_manager would
// come back up, see material it considers current, and skip — leaving
// the two copies diverged until the next expiry window.
func runCertsUpdateLocally(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) error {
	if err := certrenewer.SetOrUpdateAcmeCerts(pd); err != nil {
		return fmt.Errorf("error updating ACME certificates: %w", err)
	}

	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return fmt.Errorf("error saving platform data: %w", err)
	}

	if err := docker.PushCertsToVolume(pd); err != nil {
		// Not fatal: the system_manager_certs seed secret carries the
		// same material on the next deployment, and seeding takes the
		// newer of the two. Worth saying out loud, though.
		logger.Printf("Warning: could not write the new certificates into system_manager's volume: %v", err)
	}

	if dc == nil {
		logger.Printf("ACME certificates updated. The platform is not running, " +
			"so they will be applied on the next deployment.")
		return nil
	}

	warnings, err := docker.UpdateCertsInServices(pd, dc)
	if err != nil {
		logger.Printf("ACME certificates updated, but rolling them out to the services failed: %v", err)
		return nil
	}
	if warnings != "" {
		logger.Printf("Warnings:\n%s", warnings)
	} else {
		logger.Printf("ACME certificates updated successfully")
	}
	return nil
}
