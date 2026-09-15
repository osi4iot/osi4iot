package dockersvc

import (
	"context"
	"fmt"

	"github.com/moby/moby/client"

	"system_manager/internal/platform"
)

// ReconcileCerts makes the certificate traefik and every natsN service
// actually mount match the one system_manager holds on its volume,
// rolling them over if it doesn't.
//
// This is what closes the gap left by the platform CLI still being the
// one that deploys. The CLI builds iot_platform_cert/iot_platform_key
// from its own osi4iot_state.json, which goes stale the moment
// system_manager renews on its own schedule. So a `stop` followed weeks
// later by a `run` — or any `init` on a state file that wasn't
// downloaded first — hands traefik the certificate from whenever the CLI
// last looked, while the volume has a newer one. Nothing in the renewal
// path notices: the renewer reads the volume, sees plenty of days left,
// and correctly skips. The platform then serves an old (possibly
// expired) certificate that it already has the replacement for.
//
// Reconciling on that exact comparison — mounted secret name vs. stored
// IotPlatformCertName, both of which are content hashes — is cheap
// (a couple of ServiceInspect calls), needs no coordination with the
// CLI, and is self-healing: whatever the CLI pushed, the platform
// converges on the newest certificate within seconds of this running.
//
// It returns a short summary for the log, empty when nothing needed
// doing.
func ReconcileCerts(ctx context.Context, cli *client.Client, pd *platform.PlatformData) (string, error) {
	want := pd.DomainCerts.IotPlatformCertName
	if want == "" || pd.DomainCerts.SslCertCrt == "" || pd.DomainCerts.PrivateKey == "" {
		return "", nil // nothing stored yet — nothing to reconcile against
	}

	services, err := certConsumerServices(ctx, cli)
	if err != nil {
		return "", fmt.Errorf("error listing services: %w", err)
	}
	if len(services) == 0 {
		// Deployment still in progress, or this node lost the manager
		// role. Not an error: the next scheduled run tries again.
		return "", nil
	}

	var stale []string
	for _, svc := range services {
		name := svc.Spec.Annotations.Name
		paths := certTargetFiles[certServiceFamily(name)]
		mounted, err := findSecretByTargetFile(svc, paths["cert"])
		if err != nil {
			return "", fmt.Errorf("service '%s': %w", name, err)
		}
		if mounted != want {
			stale = append(stale, name)
		}
	}
	if len(stale) == 0 {
		return "", nil
	}

	warnings, err := UpdateCertsInServices(ctx, cli, pd)
	if err != nil {
		return warnings, fmt.Errorf("rolling %v onto the stored certificate: %w", stale, err)
	}
	return fmt.Sprintf("services %v were serving an older certificate than the one stored — rolled over\n%s",
		stale, warnings), nil
}

