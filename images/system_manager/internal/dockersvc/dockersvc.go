// Package dockersvc talks to the local node's Docker daemon (Swarm mode)
// to roll traefik/nats over to newly issued TLS secrets.
//
// NewClient requires /var/run/docker.sock bind-mounted and
// node.role==manager placement (see cmd/system_manager). A single
// manager's local socket is enough to manage the whole cluster: Swarm API
// writes are Raft-replicated.
package dockersvc

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"

	"system_manager/internal/platform"
)

// certTargetFiles mirrors services.go's targetFiles map exactly — these
// are the paths traefik/nats actually expect the mounted secret at, so
// they must stay in sync with those images' entrypoints if either
// changes.
var certTargetFiles = map[string]map[string]string{
	"nats": {
		"cert": "/etc/nats/cert.pem",
		"key":  "/etc/nats/key.pem",
	},
	"traefik": {
		"cert": "iot_platform_cert.cer",
		"key":  "iot_platform.key",
	},
}

var natsServiceName = regexp.MustCompile(`^nats\d+$`)

// NewClient returns a Docker client talking to this container's own node.
func NewClient() (*client.Client, error) {
	cli, err := client.New(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("could not create docker client: %w", err)
	}
	return cli, nil
}

// certConsumerServices discovers the traefik service and every natsN
// service currently in the swarm — dynamically, not from a replica count
// passed in at deploy time, so it stays correct if NATS is scaled later
// without needing to redeploy system_manager.
func certConsumerServices(ctx context.Context, cli *client.Client) ([]swarm.Service, error) {
	var out []swarm.Service

	if result, err := cli.ServiceInspect(ctx, "traefik", client.ServiceInspectOptions{}); err == nil {
		out = append(out, result.Service)
	}

	f := make(client.Filters).Add("name", "nats")
	result, err := cli.ServiceList(ctx, client.ServiceListOptions{Filters: f})
	if err != nil {
		return nil, fmt.Errorf("error listing nats services: %w", err)
	}
	for _, s := range result.Items {
		// Docker's name filter is a substring match — confirm it's
		// actually natsN and not something that merely contains "nats".
		if natsServiceName.MatchString(s.Spec.Annotations.Name) {
			out = append(out, s)
		}
	}
	return out, nil
}

func certServiceFamily(name string) string {
	if strings.HasPrefix(name, "nats") {
		return "nats"
	}
	return name
}

// findSecretByTargetFile returns the name of the secret currently
// mounted at targetFile in svc. Erroring here — before anything is
// created — is what keeps a surprising service spec from ever producing
// an orphan secret.
func findSecretByTargetFile(svc swarm.Service, targetFile string) (string, error) {
	for _, ref := range svc.Spec.TaskTemplate.ContainerSpec.Secrets {
		if ref.File != nil && ref.File.Name == targetFile {
			return ref.SecretName, nil
		}
	}
	return "", fmt.Errorf("no secret mounted at '%s' — refusing to create new secrets until this is fixed", targetFile)
}

type secretSwap struct {
	oldName    string
	newName    string
	newID      string
	targetFile string
}

// swapServiceSecrets replaces the named secret references on svc's spec
// (both cert and key in one shot, so the service only restarts once) and
// applies the update.
func swapServiceSecrets(ctx context.Context, cli *client.Client, svc swarm.Service, swaps []secretSwap) error {
	refs := svc.Spec.TaskTemplate.ContainerSpec.Secrets
	for _, swap := range swaps {
		found := false
		for i, ref := range refs {
			if ref.SecretName == swap.oldName {
				refs[i] = &swarm.SecretReference{
					SecretID:   swap.newID,
					SecretName: swap.newName,
					File: &swarm.SecretReferenceFileTarget{
						Name: swap.targetFile,
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
				}
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("secret '%s' no longer referenced by service — aborting this service's update", swap.oldName)
		}
	}
	svc.Spec.TaskTemplate.ContainerSpec.Secrets = refs

	// Version and Spec are required fields on ServiceUpdateOptions in
	// github.com/moby/moby/client (unlike the old docker/docker/client,
	// which took them as positional args) — an empty options struct here
	// sends a zero-value spec, not the mutated one above.
	_, err := cli.ServiceUpdate(ctx, svc.ID, client.ServiceUpdateOptions{
		Version: svc.Version,
		Spec:    svc.Spec,
	})
	return err
}

// waitForRollout polls until the service's rolling update converges,
// fails, or times out. A nil UpdateStatus means Swarm applied the spec
// without needing a rolling update at all (e.g. it converged instantly).
func waitForRollout(ctx context.Context, cli *client.Client, serviceID string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		result, err := cli.ServiceInspect(ctx, serviceID, client.ServiceInspectOptions{})
		if err != nil {
			return err
		}
		svc := result.Service
		if svc.UpdateStatus == nil {
			return nil
		}
		switch svc.UpdateStatus.State {
		case swarm.UpdateStateCompleted:
			return nil
		case swarm.UpdateStateRollbackCompleted:
			return fmt.Errorf("update rolled back: %s", svc.UpdateStatus.Message)
		case swarm.UpdateStatePaused:
			return fmt.Errorf("update paused: %s", svc.UpdateStatus.Message)
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("timed out waiting for rollout to converge")
}

func createSecret(ctx context.Context, cli *client.Client, name, data string) (string, error) {
	result, err := cli.SecretCreate(ctx, client.SecretCreateOptions{
		Spec: swarm.SecretSpec{
			Annotations: swarm.Annotations{
				Name:   name,
				Labels: map[string]string{"app": "osi4iot"},
			},
			Data: []byte(data),
		},
	})
	if err != nil {
		return "", err
	}
	return result.ID, nil
}

func removeSecretByName(ctx context.Context, cli *client.Client, name string) error {
	f := make(client.Filters).Add("name", name)
	result, err := cli.SecretList(ctx, client.SecretListOptions{Filters: f})
	if err != nil {
		return err
	}
	for _, s := range result.Items {
		if s.Spec.Name == name {
			_, err := cli.SecretRemove(ctx, s.ID, client.SecretRemoveOptions{})
			return err
		}
	}
	return nil // already gone — not an error
}

// UpdateCertsInServices creates new Docker secrets from pd.DomainCerts and
// rolls traefik + every natsN service over to them, then removes the
// secrets each successfully-updated service stopped referencing. A
// service whose rollout fails keeps its old secret (so the next cycle
// can retry cleanly) instead of being torn down.
func UpdateCertsInServices(ctx context.Context, cli *client.Client, pd *platform.PlatformData) (string, error) {
	services, err := certConsumerServices(ctx, cli)
	if err != nil {
		return "", fmt.Errorf("error listing services: %w", err)
	}
	if len(services) == 0 {
		return "", fmt.Errorf("no traefik/nats services found — refusing to create orphan cert secrets")
	}

	// 1. Validate every service references a recognizable cert+key
	//    secret BEFORE creating anything new.
	type refs struct{ certName, keyName string }
	current := make(map[string]refs, len(services))
	for _, svc := range services {
		paths := certTargetFiles[certServiceFamily(svc.Spec.Annotations.Name)]
		certName, err := findSecretByTargetFile(svc, paths["cert"])
		if err != nil {
			return "", fmt.Errorf("service '%s': %w", svc.Spec.Annotations.Name, err)
		}
		keyName, err := findSecretByTargetFile(svc, paths["key"])
		if err != nil {
			return "", fmt.Errorf("service '%s': %w", svc.Spec.Annotations.Name, err)
		}
		current[svc.Spec.Annotations.Name] = refs{certName: certName, keyName: keyName}
	}

	// 2. Create the new secrets — only reached once every service passed
	//    validation.
	certID, err := createSecret(ctx, cli, pd.DomainCerts.IotPlatformCertName, pd.DomainCerts.SslCertCrt)
	if err != nil {
		return "", fmt.Errorf("error creating cert secret: %w", err)
	}
	keyID, err := createSecret(ctx, cli, pd.DomainCerts.IotPlatformKeyName, pd.DomainCerts.PrivateKey)
	if err != nil {
		return "", fmt.Errorf("error creating key secret: %w", err)
	}

	// 3. Roll each service, one ServiceUpdate call per service (cert +
	//    key together, so it only restarts once).
	warnings := ""
	toRemove := map[string]struct{}{}
	for _, svc := range services {
		name := svc.Spec.Annotations.Name
		r := current[name]

		swaps := []secretSwap{
			{oldName: r.certName, newName: pd.DomainCerts.IotPlatformCertName, newID: certID, targetFile: certTargetFiles[certServiceFamily(name)]["cert"]},
			{oldName: r.keyName, newName: pd.DomainCerts.IotPlatformKeyName, newID: keyID, targetFile: certTargetFiles[certServiceFamily(name)]["key"]},
		}
		if err := swapServiceSecrets(ctx, cli, svc, swaps); err != nil {
			warnings += fmt.Sprintf("service '%s': update failed, kept on old certs: %v\n", name, err)
			continue
		}
		if err := waitForRollout(ctx, cli, svc.ID, 2*time.Minute); err != nil {
			warnings += fmt.Sprintf("service '%s': rollout did not converge cleanly: %v\n", name, err)
			continue
		}

		fmt.Printf("[certs] updated service '%s'\n", name)
		toRemove[r.certName] = struct{}{}
		toRemove[r.keyName] = struct{}{}
	}

	// 4. Clean up only the secrets every successfully-updated service
	//    actually stopped referencing.
	for oldName := range toRemove {
		if err := removeSecretByName(ctx, cli, oldName); err != nil {
			warnings += fmt.Sprintf("could not remove old secret '%s': %v\n", oldName, err)
		}
	}

	return warnings, nil
}
