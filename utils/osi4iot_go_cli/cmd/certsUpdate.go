package cmd

import (
	"fmt"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/certrenewer"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func runCertsUpdate() error {
    pd := data.GetData()
    expirationInfo, err := utils.GetCertsExpirationInfo(pd)
    if err != nil {
        return fmt.Errorf("error checking certificates: %w", err)
    }
    if expirationInfo.DaysToExpiry > 15 {
        fmt.Printf("Certificates are not close to expiration (%d days to expiry).\n", expirationInfo.DaysToExpiry)
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
            fmt.Println(utils.StyleWarningMsg.Render("\nWarnings:\n" + warnings))
        } else {
            fmt.Println(utils.StyleOKMsg.Render("ACME certificates have been updated successfully"))
        }
    case "Certs provided by an CA":
        return fmt.Errorf("certificate update not supported for type: %s", pd.PlatformInfo.DomainCertsType)
    }
    return nil
}