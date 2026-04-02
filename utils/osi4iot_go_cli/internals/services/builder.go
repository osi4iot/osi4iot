package services

import (
	"fmt"
	"maps"
	"slices"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

// ServiceBuilder encapsulates common logic for creating swarm services.
// It uses functional options to configure the service spec.
type ServiceBuilder struct {
	svc pt.Service
	sd  pt.SwarmData
}

// NewService initializes a builder with a mandatory name.
func NewService(name string, pd *pt.PlatformData, sd pt.SwarmData) *ServiceBuilder {
	stopGracePeriod := 20 * time.Second

	return &ServiceBuilder{
		svc: pt.Service{
			Name: name,
			Annotations: swarm.Annotations{
				Name: name,
				Labels: map[string]string{
					"app":          "osi4iot",
					"service_type": name,
				},
			},
			TaskTemplate: swarm.TaskSpec{
				ContainerSpec: &swarm.ContainerSpec{
					Labels: map[string]string{
						"app": "osi4iot",
					},
					Env: []string{
						fmt.Sprintf("TZ=%s", pd.PlatformInfo.DefaultTimeZone),
					},
					StopGracePeriod: &stopGracePeriod,
				},
				Resources: &swarm.ResourceRequirements{
					Limits: &swarm.Limit{
						NanoCPUs:    0,
						MemoryBytes: 0,
					},
					Reservations: &swarm.Resources{
						NanoCPUs:    0,
						MemoryBytes: 0,
					},
				},
				Placement: &swarm.Placement{
					Constraints: []string{},
				},
				Networks: []swarm.NetworkAttachmentConfig{},
			},
			EndpointSpec: &swarm.EndpointSpec{
				Mode: swarm.ResolutionModeVIP,
			},
			Mode: swarm.ServiceMode{
				Replicated: &swarm.ReplicatedService{
					Replicas: func(v uint64) *uint64 { return &v }(1),
				},
			},
			UpdateConfig: &swarm.UpdateConfig{
				Parallelism:     1,
				Delay:           5 * time.Second,
				FailureAction:   swarm.UpdateFailureActionRollback,
				Monitor:         20 * time.Second,
				MaxFailureRatio: 0.2,
				Order:           "start-first",
			},
			RollbackConfig: &swarm.UpdateConfig{
				Parallelism:     1,
				Delay:           5 * time.Second,
				FailureAction:   swarm.UpdateFailureActionContinue,
				Monitor:         20 * time.Second,
				MaxFailureRatio: 0.2,
				Order:           "start-first",
			},
		},
		sd: sd,
	}
}

// WithAnnotationsLabels sets the service annotations labels.
func (b *ServiceBuilder) WithAnnotationsLabels(labels map[string]string) *ServiceBuilder {
	maps.Copy(b.svc.Annotations.Labels, labels)
	return b
}

// WithNetworks sets the service networks.
func (b *ServiceBuilder) WithNetworks(networks []swarm.NetworkAttachmentConfig) *ServiceBuilder {
	// b.svc.Networks = networks
	b.svc.TaskTemplate.Networks = append(b.svc.TaskTemplate.Networks, networks...)
	return b
}

// WithImage sets the service image.
func (b *ServiceBuilder) WithImage(image string) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.Image = image
	return b
}

// WithCommand sets the service command.
func (b *ServiceBuilder) WithCommand(cmd []string) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.Command = cmd
	return b
}

// WithEnv sets the service environment variables.
func (b *ServiceBuilder) WithEnv(envVars []string) *ServiceBuilder {
	for _, envVar := range envVars {
		if envVar == "" {
			continue
		}
		b.svc.TaskTemplate.ContainerSpec.Env = append(b.svc.TaskTemplate.ContainerSpec.Env, envVar)
	}
	return b
}

// WithMounts sets the service mounts.
func (b *ServiceBuilder) WithMounts(m []mount.Mount) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.Mounts = m
	return b
}

// WithResources sets the service resource limits.
func (b *ServiceBuilder) WithResources(cpus, mem int64) *ServiceBuilder {
	b.svc.TaskTemplate.Resources.Reservations.MemoryBytes = mem
	b.svc.TaskTemplate.Resources.Reservations.NanoCPUs = cpus
	b.svc.TaskTemplate.Resources.Limits.MemoryBytes = mem
	b.svc.TaskTemplate.Resources.Limits.NanoCPUs = cpus
	return b
}

// WithMode sets the service mode.
func (b *ServiceBuilder) WithMode(mode swarm.ServiceMode) *ServiceBuilder {
	b.svc.Mode = mode
	return b
}

// WithModeGlobal sets the service mode to global.
func (b *ServiceBuilder) WithModeGlobal() *ServiceBuilder {
	b.svc.Mode = swarm.ServiceMode{Global: &swarm.GlobalService{}}
	return b
}

// WithModeReplicated sets the service mode to replicated.
func (b *ServiceBuilder) WithModeReplicated(replicas *uint64) *ServiceBuilder {
	b.svc.Mode = swarm.ServiceMode{Replicated: &swarm.ReplicatedService{Replicas: replicas}}
	return b
}

// WithHealthCheck sets the service health check.
func (b *ServiceBuilder) WithHealthCheck(commands []string) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.Healthcheck = &container.HealthConfig{
		Test:          commands,
		Interval:      time.Duration(10 * time.Second),
		Timeout:       time.Duration(1 * time.Second),
		Retries:       3,
		StartInterval: time.Duration(10 * time.Second),
	}
	return b
}

// WithRestartPolicy sets the service restart policy.
func (b *ServiceBuilder) WithRestartPolicy(delay time.Duration, condition swarm.RestartPolicyCondition) *ServiceBuilder {
	b.svc.TaskTemplate.RestartPolicy = &swarm.RestartPolicy{
		Condition:   condition,
		Delay:       durationPtr(delay),
		MaxAttempts: nil,
	}
	return b
}

// WithPorts sets the service ports.
func (b *ServiceBuilder) WithPorts(ports []swarm.PortConfig) *ServiceBuilder {
	b.svc.EndpointSpec.Ports = append(b.svc.EndpointSpec.Ports, ports...)
	return b
}

// WithPlacement sets the service placement constraints.
func (b *ServiceBuilder) WithPlacement(constraints []string) *ServiceBuilder {
	for _, constraint := range constraints {
		if constraint == "" {
			continue
		}
		b.svc.TaskTemplate.Placement.Constraints = append(b.svc.TaskTemplate.Placement.Constraints, constraint)
	}
	return b
}

// WithUpdateConfig sets the service update configuration.
func (b *ServiceBuilder) WithUpdateConfig(updateConfig *swarm.UpdateConfig) *ServiceBuilder {
	b.svc.UpdateConfig = updateConfig
	return b
}

// WithRollbackConfig sets the service rollback configuration.
func (b *ServiceBuilder) WithRollbackConfig(rollbackConfig *swarm.UpdateConfig) *ServiceBuilder {
	b.svc.RollbackConfig = rollbackConfig
	return b
}

// WithSecrets sets the service secrets.
func (b *ServiceBuilder) WithSecrets(secrets []*swarm.SecretReference) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.Secrets = secrets
	return b
}

// WithCaCertSecrets sets the service CA certificate secrets.
func (b *ServiceBuilder) WithCaCertSecrets(path string) *ServiceBuilder {
	domainCaCertSecret := &swarm.SecretReference{
		File: &swarm.SecretReferenceFileTarget{
			Name: path,
			UID:  "0",
			GID:  "0",
			Mode: 0444,
		},
		SecretID:   b.sd.Secrets["iot_platform_ca_cert"].ID,
		SecretName: b.sd.Secrets["iot_platform_ca_cert"].Name,
	}
	b.svc.TaskTemplate.ContainerSpec.Secrets = append(b.svc.TaskTemplate.ContainerSpec.Secrets, domainCaCertSecret)
	return b
}

// WithHostname sets the service hostname.
func (b *ServiceBuilder) WithHostname(hostname string) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.Hostname = hostname
	return b
}

// WithArgs sets the service arguments.
func (b *ServiceBuilder) WithArgs(args []string) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.Args = args
	return b
}

// WithUser sets the service user.
func (b *ServiceBuilder) WithUser(user string) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.User = user
	return b
}

// WithConfigs sets the service configs.
func (b *ServiceBuilder) WithConfigs(configs []*swarm.ConfigReference) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.Configs = configs
	return b
}

func (b *ServiceBuilder) WithStopSignal(signal string) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.StopSignal = signal
	return b
}

func (b *ServiceBuilder) WithStopGracePeriod(duration time.Duration) *ServiceBuilder {
	b.svc.TaskTemplate.ContainerSpec.StopGracePeriod = &duration
	return b
}

// WithGlobal sets the service to global mode.
func (b *ServiceBuilder) WithGlobal() *ServiceBuilder {
	b.svc.Mode = swarm.ServiceMode{Global: &swarm.GlobalService{}}
	return b
}

func (b *ServiceBuilder) Build() pt.Service { return b.svc }

func durationPtr(d time.Duration) *time.Duration {
	return &d
}

// GenerateServices creates a map of services based on the platform data and swarm data.
// It not includes nodered service
func GenerateServices(pd *pt.PlatformData, sd pt.SwarmData) map[string]pt.Service {
	svcResourcesMap := resources.NewSvcResourcesMap(pd)
	nodeRoleNumMap := resources.GetNodeRoleNumMap(pd)

	services := map[string]pt.Service{
		"system-prune": SystemPruneService(pd, sd, svcResourcesMap["system_prune"]),
		"traefik":      TraefikService(pd, sd, svcResourcesMap["traefik"]),
		"postgres":     PostgresService(pd, sd, svcResourcesMap["postgres"], nodeRoleNumMap),
		"timescaledb":  TimescaledbService(pd, sd, svcResourcesMap["timescaledb"], nodeRoleNumMap),
		"admin_api":    AdminApiService(pd, sd, svcResourcesMap["admin_api"], nodeRoleNumMap),
		"frontend":     FrontendService(pd, sd, svcResourcesMap["frontend"], nodeRoleNumMap),
		"grafana":      GrafanaService(pd, sd, svcResourcesMap["grafana"]),
		"pipelines":    PipelinesService(pd, sd, svcResourcesMap["pipelines"], nodeRoleNumMap),
		"auth_callout": AuthCalloutService(pd, sd, svcResourcesMap["auth_callout"], nodeRoleNumMap),
	}

	pi := pd.PlatformInfo
	numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
	for replica := 1; replica <= numNatsReplicas; replica++ {
		serviceName := fmt.Sprintf("nats%d", replica)
		services[serviceName] = NatsService(replica, numNatsReplicas, pd, sd, svcResourcesMap["nats"], nodeRoleNumMap)
	}

	existArmArchNodes := false
	for _, node := range pi.NodesData {
		if node.NodeArch == "aarch64" {
			existArmArchNodes = true
			break
		}
	}
	if !existArmArchNodes {
		services["grafana_renderer"] = GrafanaRendererService(pd, sd, svcResourcesMap["grafana_renderer"], nodeRoleNumMap)
	}

	s3BucketType := pi.S3BucketType
	if s3BucketType == "Local Minio" {
		services["minio"] = MinioService(pd, sd, svcResourcesMap["minio"], nodeRoleNumMap)
	}

	numSwarmNodes := len(pi.NodesData)
	deploymentLocation := pi.DeploymentLocation
	if numSwarmNodes > 1 && !existArmArchNodes && deploymentLocation == "On-premise cluster deployment" {
		services["keepalived"] = KeepalivedService(pd, sd, svcResourcesMap["keepalived"])
	}

	deploymentMode := pi.DeploymentMode
	if deploymentMode == "development" {
		services["pgadmin4"] = Pgadmin4Service(pd, sd, svcResourcesMap["pgadmin4"], nodeRoleNumMap)
	}

	filteredServices := map[string]pt.Service{}
	for name, svc := range services {
		excluded := slices.Contains(pd.PlatformInfo.ExcludedServices, name)
		if !excluded {
			filteredServices[name] = svc
		}
	}

	return filteredServices
}
