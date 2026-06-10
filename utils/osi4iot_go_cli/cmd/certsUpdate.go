package cmd

import (
	"fmt"
	"log"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/certrenewer"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func runCertsUpdate(logger *log.Logger) error {
    pd := data.GetData()
    if pd.PlatformInfo.DomainName == "" {
        if err := utils.ReadPlatformDataFromFile(pd); err != nil {
            return fmt.Errorf("error reading platform data: %w", err)
        }
    }

    expirationInfo, err := utils.GetCertsExpirationInfo(pd)
    if err != nil {
        return fmt.Errorf("error checking certificates: %w", err)
    }
    if expirationInfo.DaysToExpiry > 15 {
        logger.Printf("Certificates are not close to expiration (%d days to expiry).", expirationInfo.DaysToExpiry)
        return nil
    }
    switch pd.PlatformInfo.DomainCertsType {
    case "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider":
        if err := certrenewer.SetOrUpdateAcmeCerts(pd); err != nil {
            return fmt.Errorf("error updating ACME certificates: %w", err)
        }
        dc, err := docker.GetManagerDC()
        if err != nil {
            return fmt.Errorf("error getting docker client: %w", err)
        }
        warnings, err := docker.UpdateCertsInServices(pd, dc)
        if err != nil {
            return fmt.Errorf("error updating certs: %w", err)
        }
        if warnings != "" {
            logger.Printf("Warnings:\n%s", warnings)
        } else {
            logger.Printf("ACME certificates updated successfully")
        }
    case "Certs provided by an CA":
        return fmt.Errorf("certificate update not supported for type: %s", pd.PlatformInfo.DomainCertsType)
    }
    return nil
}
