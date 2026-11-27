package cmd

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/certrenewer"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

const letsEncryptRoute53Type = "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider"

var (
	certsImportKey  string
	certsImportCert string
	certsImportCa   string
)

// runCertsImport puts the domain certificates issued by a CA into the
// platform: checks them, switches the platform to "Certs provided by
// an CA" (whatever it used before) and saves the state file. A running
// platform gets them at once (traefik and the NATS nodes, as a renewal
// does) and system_manager stops renewing with Let's Encrypt; a stopped
// or deleted one gets them with the next 'osi4iot run' or 'osi4iot
// init', which deploy from the state file. Also how certificates issued
// by a CA are renewed: import the new ones.
func runCertsImport(logger *log.Logger, keyPath, certPath, caPath string) error {
	pd := data.GetData()
	if pd.PlatformInfo.DomainName == "" {
		if err := utils.ReadPlatformDataFromFile(pd); err != nil {
			return fmt.Errorf("error reading platform data: %w", err)
		}
	}

	read := func(what, path string) ([]byte, string, error) {
		if path == "" {
			return nil, "", nil
		}
		abs, err := filepath.Abs(path)
		if err != nil {
			return nil, "", fmt.Errorf("%s %s: %w", what, path, err)
		}
		b, err := os.ReadFile(abs)
		if err != nil {
			return nil, "", fmt.Errorf("reading the %s: %w", what, err)
		}
		return b, abs, nil
	}
	keyPEM, keyAbs, err := read("private key", keyPath)
	if err != nil {
		return err
	}
	certPEM, certAbs, err := read("certificate", certPath)
	if err != nil {
		return err
	}
	caPEM, caAbs, err := read("CA certificates", caPath)
	if err != nil {
		return err
	}

	material, err := certrenewer.PrepareCaCerts(pd.PlatformInfo.DomainName, keyPEM, certPEM, caPEM, time.Now())
	if err != nil {
		return err
	}

	previousType := pd.PlatformInfo.DomainCertsType
	certrenewer.SetCaCerts(pd, material, keyAbs, certAbs, caAbs)
	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return fmt.Errorf("error saving platform data: %w", err)
	}
	logger.Printf("Certificates of %s saved in the state file (valid until %s).",
		pd.PlatformInfo.DomainName, material.NotAfter.UTC().Format("2006-01-02"))
	if previousType != certrenewer.CaCertsType {
		logger.Printf("Domain certs type: %q -> %q.", previousType, certrenewer.CaCertsType)
	}

	state := data.GetPlatformState()
	if state != data.Running && state != data.Degraded {
		logger.Printf("The platform is %s: they will be used by the next 'osi4iot init' or 'osi4iot run'.", state)
		return nil
	}

	dc, err := docker.GetManagerDC()
	if err != nil {
		return fmt.Errorf("saved, but the manager could not be reached to apply them (%v): "+
			"stop and run the platform to apply them", err)
	}
	warnings, err := docker.UpdateCertsInServices(pd, dc)
	if err != nil {
		return fmt.Errorf("saved, but applying them to traefik and NATS failed (%v): "+
			"stop and run the platform to apply them", err)
	}
	if warnings != "" {
		logger.Printf("Warnings:\n%s", warnings)
	}
	logger.Printf("traefik and the NATS nodes use the new certificates.")

	// system_manager renews with Let's Encrypt only with
	// CERT_RENEWAL_ENABLED (services/system_manager.go); left on, it would
	// put its certificate back on traefik and NATS
	if previousType == letsEncryptRoute53Type && docker.IsSystemManagerRunning(dc) {
		svc, err := utils.GetSwarmServiceByName(dc, "system_manager")
		if err == nil {
			_, err = docker.ServiceUpdate(pd, dc, svc, "system_manager", docker.ServiceUpdateOptions{
				RemoveEnv: []string{"CERT_RENEWAL_ENABLED"},
			})
		}
		if err != nil {
			return fmt.Errorf("the certificates are applied, but system_manager could not stop renewing with "+
				"Let's Encrypt (%v): stop and run the platform, or it may put its certificate back", err)
		}
		logger.Printf("system_manager no longer renews with Let's Encrypt.")
	}
	return nil
}
