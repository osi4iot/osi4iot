package cmd

import (
	"fmt"
	"log"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// runCertsDownload pulls the certificate material system_manager holds
// into this CLI's state file.
//
// It is needed because renewal lives in system_manager now: once it
// renews, osi4iot_state.json still describes the certificate from
// whenever the CLI last looked. That stale copy is what `osi4iot certs
// check` reports on, and — before docker.SyncCertsFromSystemManager was
// wired into the deployment path — what a later `init` would push back
// into the swarm's secrets.
//
// The download itself goes through docker.SyncCertsFromSystemManager,
// which picks NATS or the volume depending on whether the platform is
// actually up, so this works on a stopped platform too.
func runCertsDownload(logger *log.Logger) error {
	pd := data.GetData()
	if pd.PlatformInfo.DomainName == "" {
		if err := utils.ReadPlatformDataFromFile(pd); err != nil {
			return fmt.Errorf("error reading platform data: %w", err)
		}
	}

	if pd.PlatformInfo.DomainCertsType != "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		return fmt.Errorf("certificate download only applies to Let's Encrypt certificates, "+
			"this platform uses: %s", pd.PlatformInfo.DomainCertsType)
	}
	if pd.PlatformInfo.PlatformEncryptionKey == "" {
		return fmt.Errorf("no certs encryption key in the platform state — " +
			"this platform predates encrypted certificate storage")
	}

	// dc is optional: without it the volume is still readable through
	// pt.DCMap, only the NATS path is unavailable.
	dc, _ := docker.GetManagerDC()

	updated, source, err := docker.SyncCertsFromSystemManager(pd, dc)
	if err != nil {
		return err
	}
	if !updated {
		if source == "" {
			logger.Printf("system_manager has no certificates stored yet — nothing to download.")
		} else {
			logger.Printf("Local certificates are already up to date (checked against %s).", source)
		}
		return nil
	}

	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return fmt.Errorf("error saving platform data: %w", err)
	}

	expirationInfo, err := utils.GetCertsExpirationInfo(pd)
	if err != nil {
		logger.Printf("Certificates updated from %s.", source)
		return nil
	}
	logger.Printf("Certificates updated from %s. New expiration: %s (%d days).",
		source, expirationInfo.ExpirationTime, expirationInfo.DaysToExpiry)
	return nil
}
