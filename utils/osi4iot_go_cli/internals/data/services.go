package data

import (
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
)

type Service struct {
	Name           string
	Annotations    swarm.Annotations
	TaskTemplate   swarm.TaskSpec
	EndpointSpec   *swarm.EndpointSpec
	Mode           swarm.ServiceMode
	UpdateConfig   *swarm.UpdateConfig
	RollbackConfig *swarm.UpdateConfig
	Networks       []swarm.NetworkAttachmentConfig
}

func GenerateServices(swarmData SwarmData) map[string]Service {
	Services := make(map[string]Service)
	deploymentMode := Data.PlatformInfo.DeploymentMode
	s3BucketType := Data.PlatformInfo.S3BucketType
	domainCertsType := Data.PlatformInfo.DomainCertsType
	numSwarmNodes := len(Data.PlatformInfo.NodesData)

	workerConstraintsArray := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}

	if numSwarmNodes == 1 {
		workerConstraintsArray = []string{
			"node.role==manager",
		}
	}

	systemPruneAnottations := swarm.Annotations{
		Name: "system-prune",
		Labels: map[string]string{
			"app": "osi4iot",
		},
	}
	systemPruneTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/system_prune:latest",
			Labels: map[string]string{
				"app":          "osi4iot",
				"service_type": "system-prune",
			},
			Env: []string{
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Command: []string{
				"docker",
				"system",
				"prune",
				"--all",
				"--force",
			},
			Mounts: []mount.Mount{
				{
					Type:   mount.TypeBind,
					Source: "/var/run/docker.sock",
					Target: "/var/run/docker.sock",
				},
			},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("system_prune"),
				MemoryBytes: giveMemory("system_prune"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("system_prune"),
				MemoryBytes: giveMemory("system_prune"),
			},
		},
		RestartPolicy: &swarm.RestartPolicy{
			Delay:       durationPtr(24 * time.Hour),
			Condition:   swarm.RestartPolicyConditionAny,
			MaxAttempts: nil,
		},
	}
	systemPruneEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
	}
	systemPruneMode := swarm.ServiceMode{
		Global: &swarm.GlobalService{},
	}
	systemPruneNetwork := []swarm.NetworkAttachmentConfig{}

	Services["system-prune"] = Service{
		Name:         "system-prune",
		Annotations:  systemPruneAnottations,
		TaskTemplate: systemPruneTaskTemplate,
		EndpointSpec: systemPruneEndpointSpec,
		Mode:         systemPruneMode,
		Networks:     systemPruneNetwork,
	}

	traefikAnottations := swarm.Annotations{
		Name: "traefik",
		Labels: map[string]string{
			"app":          "osi4iot",
			"service_type": "traefik",
		},
	}
	traefikSecrets := []*swarm.SecretReference{}
	traefikConfigs := []*swarm.ConfigReference{}
	acmeEmail := Data.PlatformInfo.NotificationsEmailAddress
	if domainCertsType == "Certs provided by an CA" {
		traefikSecrets = []*swarm.SecretReference{
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "iot_platform_cert.cer",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   swarmData.Secrets["iot_platform_cert"].ID,
				SecretName: swarmData.Secrets["iot_platform_cert"].Name,
			},
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "iot_platform.key",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   swarmData.Secrets["iot_platform_key"].ID,
				SecretName: swarmData.Secrets["iot_platform_key"].Name,
			},
		}
	}
	traefikTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/traefik:v2.10",
			Labels: map[string]string{
				"app": "osi4iot",
			},
			Env: []string{
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Healthcheck: &container.HealthConfig{
				Test: []string{
					"CMD-SHELL",
					"wget --quiet --tries=1 --spider --no-check-certificate http://127.0.0.1:8080/ping || exit 1",
				},
				Interval:      time.Duration(10 * time.Second),
				Timeout:       time.Duration(1 * time.Second),
				Retries:       3,
				StartInterval: time.Duration(10 * time.Second),
			},
			Command: []string{
				"traefik",
				"--api.insecure=false",
				"--providers.docker=true",
				"--providers.docker.swarmMode=true",
				"--providers.docker.exposedByDefault=false",
				"--entrypoints.web.address=:80",
				"--ping=true",
				"--entrypoints.web.http.redirections.entrypoint.to=websecure",
				"--entrypoints.web.http.redirections.entrypoint.scheme=https",
				"--entrypoints.web.http.redirections.entrypoint.permanent=true",
				"--entrypoints.websecure.address=:443",
				"--entrypoints.mqtt.address=:1883",
				"--entrypoints.mqtt-tls.address=:8884",
				"--entrypoints.wss.address=:9001",
				"--providers.file.directory=/etc/traefik/dynamic",
				"--providers.file.watch=true",
				"--providers.docker.network=traefik_public",
				"--api",
				"--accesslog",
				"--log",
			},
			Secrets: traefikSecrets,
			Configs: traefikConfigs,
			Mounts: []mount.Mount{
				{
					Target:   "/var/run/docker.sock",
					Source:   "/var/run/docker.sock",
					Type:     mount.TypeBind,
					ReadOnly: true,
				},
			},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("traefik"),
				MemoryBytes: giveMemory("traefik"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("traefik"),
				MemoryBytes: giveMemory("traefik"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: []string{"node.role == manager"},
		},
	}
	resolver := ""
	if domainCertsType[0:20] == "Let's encrypt certs" {
		commandsArray := traefikTaskTemplate.ContainerSpec.Command
		if domainCertsType == "Let's encrypt certs with HTTP-01 challenge" {
			commandsArray = append(commandsArray, "--certificatesresolvers.httpresolver.acme.httpchallenge=true")
			commandsArray = append(commandsArray, "--certificatesresolvers.httpresolver.acme.httpchallenge.entrypoint=web")
			commandsArray = append(commandsArray, fmt.Sprintf("--certificatesresolvers.httpresolver.acme.email=%s", acmeEmail))
			commandsArray = append(commandsArray, "--certificatesresolvers.httpresolver.acme.storage=/letsencrypt/acme.json")
			commandsArray = append(commandsArray, "--certificatesresolvers.httpresolver.acme.dnschallenge=true")
			resolver = "httpresolver"
		} else if domainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
			commandsArray = append(commandsArray, "--certificatesresolvers.route53resolver.acme.dnschallenge=true")
			commandsArray = append(commandsArray, "--certificatesresolvers.route53resolver.acme.dnschallenge.provider=route53")
			commandsArray = append(commandsArray, fmt.Sprintf("--certificatesresolvers.route53resolver.acme.email=%s", acmeEmail))
			commandsArray = append(commandsArray, "--certificatesresolvers.route53resolver.acme.storage=/letsencrypt/acme.json")
			resolver = "route53resolver"
		} else if domainCertsType == "Let's encrypt certs with DNS-01 challenge and Namecheap provider" {
			commandsArray = append(commandsArray, "--certificatesresolvers.namecheapresolver.acme.dnschallenge=true")
			commandsArray = append(commandsArray, "--certificatesresolvers.namecheapresolver.acme.dnschallenge.provider=namecheap")
			commandsArray = append(commandsArray, fmt.Sprintf("--certificatesresolvers.namecheapresolver.acme.email=%s", acmeEmail))
			commandsArray = append(commandsArray, "--certificatesresolvers.namecheapresolver.acme.storage=/letsencrypt/acme.json")
			resolver = "namecheapresolver"
		}
		traefikTaskTemplate.ContainerSpec.Command = commandsArray
		mountsArray := traefikTaskTemplate.ContainerSpec.Mounts
		mountsArray = append(mountsArray, mount.Mount{
			Type:   mount.TypeVolume,
			Source: swarmData.Volumes["letsencrypt"].Name,
			Target: "/letsencrypt",
		})
		traefikTaskTemplate.ContainerSpec.Mounts = mountsArray
	}

	traefikEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
		Ports: []swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    80,
				PublishedPort: 80,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    443,
				PublishedPort: 443,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    1883,
				PublishedPort: 1883,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    8884,
				PublishedPort: 8884,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    9001,
				PublishedPort: 9001,
			},
		},
	}
	traefikMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("traefik"), // helper para puntero de uint64
		},
	}
	traefikUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	traefikRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	traefikNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["traefik_public"].Name},
	}
	Services["traefik"] = Service{
		Name:           "traefik",
		Annotations:    traefikAnottations,
		TaskTemplate:   traefikTaskTemplate,
		EndpointSpec:   traefikEndpointSpec,
		Mode:           traefikMode,
		UpdateConfig:   traefikUpdateConfig,
		RollbackConfig: traefikRollbackConfig,
		Networks:       traefikNetwork,
	}

	mosquittoRule := fmt.Sprintf("Host(`%s`)", Data.PlatformInfo.DomainName)
	mosquittoRule8884 := fmt.Sprintf("HostSNI(`%s`)", Data.PlatformInfo.DomainName)
	mosquitoAnottations := swarm.Annotations{
		Name: "mosquitto",
		Labels: map[string]string{
			"app":            "osi4iot",
			"service_type":   "mosquitto",
			"traefik.enable": "true",
			// MQTT without TLS (1883, TCP puro)
			"traefik.tcp.routers.mosquitto1883.rule":                      "HostSNI(`*`)",
			"traefik.tcp.routers.mosquitto1883.entrypoints":               "mqtt",
			"traefik.tcp.routers.mosquitto1883.service":                   "mosquitto1883",
			"traefik.tcp.services.mosquitto1883.loadbalancer.server.port": "1883",
			// MQTT with TLS (1883, TCP)
			"traefik.tcp.routers.mosquitto8884.rule":                      mosquittoRule8884,
			"traefik.tcp.routers.mosquitto8884.entrypoints":               "mqtt-tls",
			"traefik.tcp.routers.mosquitto8884.service":                   "mosquitto8884",
			"traefik.tcp.routers.mosquitto8884.tls":                       "true",
			"traefik.tcp.routers.mosquitto8884.tls.certresolver":          resolver,
			"traefik.tcp.services.mosquitto8884.loadbalancer.server.port": "8884",
			// MQTT over WebSockets (WSS) Port 9001
			"traefik.http.routers.mosquitto-wss.rule":                      mosquittoRule,
			"traefik.http.routers.mosquitto-wss.entrypoints":               "wss",
			"traefik.http.routers.mosquitto-wss.service":                   "mosquitto-wss",
			"traefik.http.routers.mosquitto-wss.tls":                       "true",
			"traefik.http.routers.mosquitto-wss.tls.certresolver":          resolver,
			"traefik.http.services.mosquitto-wss.loadbalancer.server.port": "9001",
		},
	}
	mosquitoTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/mosquitto_go_auth:2.1.0-mosquitto_2.0.15",
			Labels: map[string]string{
				"app": "osi4iot",
			},
			Env: []string{
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Secrets: []*swarm.SecretReference{
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "/mosquitto/mqtt_certs/ca.crt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["mqtt_certs_ca_cert"].ID,
					SecretName: swarmData.Secrets["mqtt_certs_ca_cert"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "/mosquitto/mqtt_certs/server.crt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["mqtt_broker_cert"].ID,
					SecretName: swarmData.Secrets["mqtt_broker_cert"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "/mosquitto/mqtt_certs/server.key",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["mqtt_broker_key"].ID,
					SecretName: swarmData.Secrets["mqtt_broker_key"].Name,
				},
			},
			Configs: []*swarm.ConfigReference{
				{
					File: &swarm.ConfigReferenceFileTarget{
						Name: "/etc/mosquitto/mosquitto.conf",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					ConfigID:   swarmData.Configs["mosquitto_conf"].ID,
					ConfigName: swarmData.Configs["mosquitto_conf"].Name,
				},
				{
					File: &swarm.ConfigReferenceFileTarget{
						Name: "/etc/mosquitto/conf.d/go-auth.conf",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					ConfigID:   swarmData.Configs["mosquitto_go_auth"].ID,
					ConfigName: swarmData.Configs["mosquitto_go_auth"].Name,
				},
			},
			Mounts: []mount.Mount{
				{
					Type:   mount.TypeVolume,
					Source: swarmData.Volumes["mosquitto_data"].Name,
					Target: "/mosquitto/data",
				},
				{
					Type:   mount.TypeVolume,
					Source: swarmData.Volumes["mosquitto_log"].Name,
					Target: "/mosquitto/log",
				},
			},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("mosquitto"),
				MemoryBytes: giveMemory("mosquitto"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("mosquitto"),
				MemoryBytes: giveMemory("mosquitto"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: workerConstraintsArray,
		},
	}
	mosquitoEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
		Ports: []swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    8883,
				PublishedPort: 8883,
			},
		},
	}

	mosquitoMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("mosquitto"),
		},
	}
	mosquitoUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	mosquitoRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	mosquitoNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["internal_net"].Name},
		{Target: swarmData.Networks["traefik_public"].Name},
	}
	Services["mosquitto"] = Service{
		Name:           "mosquitto",
		Annotations:    mosquitoAnottations,
		TaskTemplate:   mosquitoTaskTemplate,
		EndpointSpec:   mosquitoEndpointSpec,
		Mode:           mosquitoMode,
		UpdateConfig:   mosquitoUpdateConfig,
		RollbackConfig: mosquitoRollbackConfig,
		Networks:       mosquitoNetwork,
	}

	postgresAnottations := swarm.Annotations{
		Name: "postgres",
		Labels: map[string]string{
			"app":          "osi4iot",
			"service_type": "postgres",
		},
	}
	postgresTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/postgres:14.6-alpine",
			Labels: map[string]string{
				"app": "osi4iot",
			},
			Env: []string{
				fmt.Sprintf("POSTGRES_DB=%s", Data.PlatformInfo.PostgresDB),
				"POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password.txt",
				"POSTGRES_USER_FILE=/run/secrets/postgres_user.txt",
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Secrets: []*swarm.SecretReference{
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "postgres_user.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["postgres_user"].ID,
					SecretName: swarmData.Secrets["postgres_user"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "postgres_password.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["postgres_password"].ID,
					SecretName: swarmData.Secrets["postgres_password"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "postgres_grafana.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["postgres_grafana"].ID,
					SecretName: swarmData.Secrets["postgres_grafana"].Name,
				},
			},
			Mounts: []mount.Mount{
				{
					Type:   mount.TypeVolume,
					Source: swarmData.Volumes["pgdata"].Name,
					Target: "/var/lib/postgresql/data",
				},
			},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("postgres"),
				MemoryBytes: giveMemory("postgres"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("postgres"),
				MemoryBytes: giveMemory("postgres"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: workerConstraintsArray,
		},
	}
	postgresEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
	}

	postgresMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("postgres"),
		},
	}
	postgresUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	postgresRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	postgresNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["internal_net"].Name},
	}
	Services["postgres"] = Service{
		Name:           "postgres",
		Annotations:    postgresAnottations,
		TaskTemplate:   postgresTaskTemplate,
		EndpointSpec:   postgresEndpointSpec,
		Mode:           postgresMode,
		UpdateConfig:   postgresUpdateConfig,
		RollbackConfig: postgresRollbackConfig,
		Networks:       postgresNetwork,
	}

	timescaledbAnottations := swarm.Annotations{
		Name: "timescaledb",
		Labels: map[string]string{
			"app":          "osi4iot",
			"service_type": "timescaledb",
		},
	}
	timescaledbTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/timescaledb:2.4.2-pg13",
			Labels: map[string]string{
				"app": "osi4iot",
			},
			Env: []string{
				fmt.Sprintf("POSTGRES_DB=%s", Data.PlatformInfo.TimescaleDB),
				"POSTGRES_PASSWORD_FILE=/run/secrets/timescaledb_password.txt",
				"POSTGRES_USER_FILE=/run/secrets/timescaledb_user.txt",
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Secrets: []*swarm.SecretReference{
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "timescaledb_user.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["timescale_user"].ID,
					SecretName: swarmData.Secrets["timescale_user"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "timescaledb_password.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["timescale_password"].ID,
					SecretName: swarmData.Secrets["timescale_password"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "timescaledb_grafana.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["timescale_grafana"].ID,
					SecretName: swarmData.Secrets["timescale_grafana"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "timescaledb_data_ret_int.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["timescale_data_ret_int"].ID,
					SecretName: swarmData.Secrets["timescale_data_ret_int"].Name,
				},
			},
			Mounts: []mount.Mount{
				{
					Type:   mount.TypeVolume,
					Source: swarmData.Volumes["timescaledb_data"].Name,
					Target: "/var/lib/postgresql/data",
				},
			},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("timescaledb"),
				MemoryBytes: giveMemory("timescaledb"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("timescaledb"),
				MemoryBytes: giveMemory("timescaledb"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: workerConstraintsArray,
		},
	}
	timescaledbEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
	}
	timescaledbMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("timescaledb"),
		},
	}
	timescaledbUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	timescaledbRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	timescaledbNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["internal_net"].Name},
	}
	Services["timescaledb"] = Service{
		Name:           "timescaledb",
		Annotations:    timescaledbAnottations,
		TaskTemplate:   timescaledbTaskTemplate,
		EndpointSpec:   timescaledbEndpointSpec,
		Mode:           timescaledbMode,
		UpdateConfig:   timescaledbUpdateConfig,
		RollbackConfig: timescaledbRollbackConfig,
		Networks:       timescaledbNetwork,
	}

	s3StorageAnottations := swarm.Annotations{
		Name: "s3_storage",
		Labels: map[string]string{
			"app":          "osi4iot",
			"service_type": "s3_storage",
		},
	}
	s3StorageTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/s3_storage:1.3.0",
			Labels: map[string]string{
				"app": "osi4iot",
			},
			Env: []string{
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Secrets: []*swarm.SecretReference{
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "s3_storage.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["s3_storage"].ID,
					SecretName: swarmData.Secrets["s3_storage"].Name,
				},
			},
			Configs: []*swarm.ConfigReference{
				{
					File: &swarm.ConfigReferenceFileTarget{
						Name: "/run/configs/s3_storage.conf",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					ConfigID:   swarmData.Configs["s3_storage"].ID,
					ConfigName: swarmData.Configs["s3_storage"].Name,
				},
			},
			Mounts: []mount.Mount{
				{
					Type:   mount.TypeVolume,
					Source: swarmData.Volumes["s3_storage_data"].Name,
					Target: "/data",
				},
			},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("s3_storage"),
				MemoryBytes: giveMemory("s3_storage"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("s3_storage"),
				MemoryBytes: giveMemory("s3_storage"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: workerConstraintsArray,
		},
	}
	s3StorageEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
		Ports: []swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    3500,
				PublishedPort: 3500,
			},
		},
	}
	s3StorageMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("s3_storage"),
		},
	}
	s3StorageUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	s3StorageRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	s3StorageNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["internal_net"].Name},
	}
	Services["s3_storage"] = Service{
		Name:           "s3_storage",
		Annotations:    s3StorageAnottations,
		TaskTemplate:   s3StorageTaskTemplate,
		EndpointSpec:   s3StorageEndpointSpec,
		Mode:           s3StorageMode,
		UpdateConfig:   s3StorageUpdateConfig,
		RollbackConfig: s3StorageRollbackConfig,
		Networks:       s3StorageNetwork,
	}

	dev2pdbAnottations := swarm.Annotations{
		Name: "dev2pdb",
		Labels: map[string]string{
			"app": "osi4iot",
		},
	}
	dev2pdbTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/dev2pdb:1.3.0",
			Labels: map[string]string{
				"app":          "osi4iot",
				"service_type": "dev2pdb",
			},
			Env: []string{
				"DATABASE_NAME=iot_data_db",
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Secrets: []*swarm.SecretReference{
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "dev2pdb_password.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["dev2pdb_password"].ID,
					SecretName: swarmData.Secrets["dev2pdb_password"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "timescaledb_user.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["timescale_user"].ID,
					SecretName: swarmData.Secrets["timescale_user"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "timescaledb_password.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["timescale_password"].ID,
					SecretName: swarmData.Secrets["timescale_password"].Name,
				},
			},
			Mounts: []mount.Mount{},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("dev2pdb"),
				MemoryBytes: giveMemory("dev2pdb"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("dev2pdb"),
				MemoryBytes: giveMemory("dev2pdb"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: workerConstraintsArray,
		},
	}
	dev2pdbEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
	}
	dev2pdbMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("dev2pdb"),
		},
	}
	dev2pdbUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	dev2pdbRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	dev2pdbNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["internal_net"].Name},
	}
	Services["dev2pdb"] = Service{
		Name:           "dev2pdb",
		Annotations:    dev2pdbAnottations,
		TaskTemplate:   dev2pdbTaskTemplate,
		EndpointSpec:   dev2pdbEndpointSpec,
		Mode:           dev2pdbMode,
		UpdateConfig:   dev2pdbUpdateConfig,
		RollbackConfig: dev2pdbRollbackConfig,
		Networks:       dev2pdbNetwork,
	}

	grafanaRule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/grafana/`)", Data.PlatformInfo.DomainName)
	grafanaRedirectRegex := fmt.Sprintf("%s/(grafana*)", Data.PlatformInfo.DomainName)
	grafanaRedirectReplacement := fmt.Sprintf("%s/$${1}", Data.PlatformInfo.DomainName)
	grafanaAnottations := swarm.Annotations{
		Name: "grafana",
		Labels: map[string]string{
			"app":                               "osi4iot",
			"traefik.enable":                    "true",
			"service_type":                      "grafana",
			"traefik.http.routers.grafana.rule": grafanaRule,
			"traefik.http.middlewares.grafana-prefix.stripprefix.prefixes":                       "/grafana",
			"traefik.http.routers.grafana.middlewares":                                           "grafana-prefix,grafana-header,grafana-redirectregex",
			"traefik.http.middlewares.grafana-prefix.stripprefix.forceslash":                     "false",
			"traefik.http.middlewares.grafana-header.headers.customrequestheaders.X-Script-Name": "/grafana/",
			"traefik.http.middlewares.grafana-redirectregex.redirectregex.regex":                 grafanaRedirectRegex,
			"traefik.http.middlewares.grafana-redirectregex.redirectregex.replacement":           grafanaRedirectReplacement,
			"traefik.http.routers.grafana.entrypoints":                                           "websecure",
			"traefik.http.routers.grafana.tls":                                                   "true",
			"traefik.http.routers.grafana.tls.certresolver":                                      resolver,
			"traefik.http.routers.grafana.service":                                               "grafana",
			"traefik.http.services.grafana.loadbalancer.server.port":                             "5000",
			"traefik.http.services.grafana.loadbalancer.healthCheck.path":                        "/api/health",
			"traefik.http.services.grafana.loadbalancer.healthCheck.interval":                    "5s",
			"traefik.http.services.grafana.loadbalancer.healthCheck.timeout":                     "3s",
		},
	}
	grafanaTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/grafana:8.4.1-ubuntu",
			Labels: map[string]string{
				"app": "osi4iot",
			},
			Env: []string{
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Secrets: []*swarm.SecretReference{
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "grafana.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["grafana"].ID,
					SecretName: swarmData.Secrets["grafana"].Name,
				},
			},
			Configs: []*swarm.ConfigReference{
				{
					File: &swarm.ConfigReferenceFileTarget{
						Name: "/run/configs/grafana.conf",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					ConfigID:   swarmData.Configs["grafana"].ID,
					ConfigName: swarmData.Configs["grafana"].Name,
				},
			},
			Mounts: []mount.Mount{
				{
					Type:   mount.TypeVolume,
					Source: swarmData.Volumes["grafana_data"].Name,
					Target: "/var/lib/grafana",
				},
			},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("grafana"),
				MemoryBytes: giveMemory("grafana"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("grafana"),
				MemoryBytes: giveMemory("grafana"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: []string{"node.role == manager"},
		},
	}
	grafanaEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
	}
	grafanaMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("grafana"),
		},
	}
	grafanaUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	grafanaRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	grafanaNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["internal_net"].Name},
		{Target: swarmData.Networks["traefik_public"].Name},
	}
	Services["grafana"] = Service{
		Name:           "grafana",
		Annotations:    grafanaAnottations,
		TaskTemplate:   grafanaTaskTemplate,
		EndpointSpec:   grafanaEndpointSpec,
		Mode:           grafanaMode,
		UpdateConfig:   grafanaUpdateConfig,
		RollbackConfig: grafanaRollbackConfig,
		Networks:       grafanaNetwork,
	}

	adminApiRule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/admin_api/`)", Data.PlatformInfo.DomainName)
	adminApiAnottations := swarm.Annotations{
		Name: "admin_api",
		Labels: map[string]string{
			"app":            "osi4iot",
			"service_type":   "admin_api",
			"traefik.enable": "true",
			"traefik.http.middlewares.admin_api-header.headers.customrequestheaders.X-Script-Name": "/admin_api/",
			"traefik.http.middlewares.admin_api-prefix.stripprefix.prefixes":                       "/admin_api",
			"traefik.http.middlewares.admin_api-prefix.stripprefix.forceslash":                     "false",
			"traefik.http.middlewares.admin_api-redirectregex.redirectregex.regex":                 "^/admin_api(.*)",
			"traefik.http.middlewares.admin_api-redirectregex.redirectregex.replacement":           "/$1",
			"traefik.http.routers.admin_api.entrypoints":                                           "websecure",
			"traefik.http.routers.admin_api.rule":                                                  adminApiRule,
			"traefik.http.routers.admin_api.tls":                                                   "true",
			"traefik.http.routers.admin_api.tls.certresolver":                                      resolver,
			"traefik.http.routers.admin_api.middlewares":                                           "admin_api-redirectregex,admin_api-prefix,admin_api-header",
			"traefik.http.routers.admin_api.service":                                               "admin_api",
			"traefik.http.services.admin_api.loadbalancer.server.port":                             "3200",
			"traefik.http.services.admin_api.loadbalancer.healthcheck.path":                        "/health",
			"traefik.http.services.admin_api.loadbalancer.healthcheck.interval":                    "5s",
			"traefik.http.services.admin_api.loadbalancer.healthcheck.timeout":                     "3s",
		},
	}
	adminApiTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/admin_api:1.3.0",
			Labels: map[string]string{
				"app": "osi4iot",
			},
			Env: []string{
				"REPLICA={{.Task.Slot}}",
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Secrets: []*swarm.SecretReference{
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "ca.crt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["mqtt_certs_ca_cert"].ID,
					SecretName: swarmData.Secrets["mqtt_certs_ca_cert"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "ca.key",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["mqtt_certs_ca_key"].ID,
					SecretName: swarmData.Secrets["mqtt_certs_ca_key"].Name,
				},
				{
					File: &swarm.SecretReferenceFileTarget{
						Name: "admin_api.txt",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					SecretID:   swarmData.Secrets["admin_api"].ID,
					SecretName: swarmData.Secrets["admin_api"].Name,
				},
			},
			Configs: []*swarm.ConfigReference{
				{
					File: &swarm.ConfigReferenceFileTarget{
						Name: "/run/configs/admin_api.conf",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					ConfigID:   swarmData.Configs["admin_api"].ID,
					ConfigName: swarmData.Configs["admin_api"].Name,
				},
				{
					File: &swarm.ConfigReferenceFileTarget{
						Name: "/run/configs/main_org_building.geojson",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					ConfigID:   swarmData.Configs["main_org_building"].ID,
					ConfigName: swarmData.Configs["main_org_building"].Name,
				},
				{
					File: &swarm.ConfigReferenceFileTarget{
						Name: "/run/configs/main_org_floor.geojson",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					ConfigID:   swarmData.Configs["main_org_floor"].ID,
					ConfigName: swarmData.Configs["main_org_floor"].Name,
				},
			},
			Mounts: []mount.Mount{
				{
					Type:   mount.TypeVolume,
					Source: swarmData.Volumes["admin_api_log"].Name,
					Target: "/app/logs",
				},
			},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("admin_api"),
				MemoryBytes: giveMemory("admin_api"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("admin_api"),
				MemoryBytes: giveMemory("admin_api"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: workerConstraintsArray,
		},
	}
	adminApiEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
		Ports: []swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    3200,
				PublishedPort: 3200,
			},
		},
	}
	adminApiMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("admin_api"),
		},
	}
	adminApiUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	adminApiRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	adminApiNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["internal_net"].Name},
		{Target: swarmData.Networks["traefik_public"].Name},
	}
	Services["admin_api"] = Service{
		Name:           "admin_api",
		Annotations:    adminApiAnottations,
		TaskTemplate:   adminApiTaskTemplate,
		EndpointSpec:   adminApiEndpointSpec,
		Mode:           adminApiMode,
		UpdateConfig:   adminApiUpdateConfig,
		RollbackConfig: adminApiRollbackConfig,
		Networks:       adminApiNetwork,
	}

	frontendRule := fmt.Sprintf("Host(`%s`)", Data.PlatformInfo.DomainName)
	frontendAnottations := swarm.Annotations{
		Name: "frontend",
		Labels: map[string]string{
			"app":                                "osi4iot",
			"service_type":                       "frontend",
			"traefik.enable":                     "true",
			"traefik.http.routers.frontend.rule": frontendRule,
			"traefik.http.routers.frontend.entrypoints":                        "websecure",
			"traefik.http.routers.frontend.tls":                                "true",
			"traefik.http.routers.frontend.tls.certresolver":                   resolver,
			"traefik.http.routers.frontend.service":                            "frontend",
			"traefik.http.services.frontend.loadbalancer.server.port":          "80",
			"traefik.http.services.frontend.loadbalancer.healthCheck.path":     "/health",
			"traefik.http.services.frontend.loadbalancer.healthCheck.interval": "5s",
			"traefik.http.services.frontend.loadbalancer.healthCheck.timeout":  "3s",
		},
	}
	frontendTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/frontend:1.3.0",
			Labels: map[string]string{
				"app": "osi4iot",
			},
			Env: []string{
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Configs: []*swarm.ConfigReference{
				{
					File: &swarm.ConfigReferenceFileTarget{
						Name: "/run/configs/frontend.conf",
						UID:  "0",
						GID:  "0",
						Mode: 0444,
					},
					ConfigID:   swarmData.Configs["frontend"].ID,
					ConfigName: swarmData.Configs["frontend"].Name,
				},
			},
			Mounts: []mount.Mount{},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("frontend"),
				MemoryBytes: giveMemory("frontend"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("frontend"),
				MemoryBytes: giveMemory("frontend"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: workerConstraintsArray,
		},
	}
	frontendEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
	}
	frontendMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("frontend"),
		},
	}
	frontendUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	frontendRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	frontendNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["traefik_public"].Name},
	}
	Services["frontend"] = Service{
		Name:           "frontend",
		Annotations:    frontendAnottations,
		TaskTemplate:   frontendTaskTemplate,
		EndpointSpec:   frontendEndpointSpec,
		Mode:           frontendMode,
		UpdateConfig:   frontendUpdateConfig,
		RollbackConfig: frontendRollbackConfig,
		Networks:       frontendNetwork,
	}

	grafanaRendererAnottations := swarm.Annotations{
		Name: "grafana_renderer",
		Labels: map[string]string{
			"app": "osi4iot",
		},
	}
	grafanaRendererTaskTemplate := swarm.TaskSpec{
		ContainerSpec: &swarm.ContainerSpec{
			Image: "ghcr.io/osi4iot/grafana_renderer:3.8.4",
			Labels: map[string]string{
				"app":          "osi4iot",
				"service_type": "grafana_renderer",
			},
			Env: []string{
				"ENABLE_METRICS=true",
				fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
			},
			Mounts: []mount.Mount{},
		},
		Resources: &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    giveCPUs("grafana_renderer"),
				MemoryBytes: giveMemory("grafana_renderer"),
			},
			Reservations: &swarm.Resources{
				NanoCPUs:    giveCPUs("grafana_renderer"),
				MemoryBytes: giveMemory("grafana_renderer"),
			},
		},
		Placement: &swarm.Placement{
			Constraints: []string{
				"node.role == manager",
				"node.platform.arch==x86_64",
			},
		},
	}
	grafanaRendererEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
		Ports: []swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    8081,
				PublishedPort: 8081,
			},
		},
	}
	grafanaRendererMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: giveReplicsPtr("grafana_renderer"),
		},
	}
	grafanaRendererUpdateConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	grafanaRendererRollbackConfig := &swarm.UpdateConfig{
		Parallelism:     2,
		Delay:           time.Duration(5 * time.Second),
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         time.Duration(20 * time.Second),
		MaxFailureRatio: 0.2,
		Order:           "start-first",
	}
	grafanaRendererNetwork := []swarm.NetworkAttachmentConfig{
		{Target: swarmData.Networks["internal_net"].Name},
	}
	Services["grafana_renderer"] = Service{
		Name:           "grafana_renderer",
		Annotations:    grafanaRendererAnottations,
		TaskTemplate:   grafanaRendererTaskTemplate,
		EndpointSpec:   grafanaRendererEndpointSpec,
		Mode:           grafanaRendererMode,
		UpdateConfig:   grafanaRendererUpdateConfig,
		RollbackConfig: grafanaRendererRollbackConfig,
		Networks:       grafanaRendererNetwork,
	}

	if s3BucketType == "Local Minio" {
		minioRule := fmt.Sprintf("Host(`minio.%s`)", Data.PlatformInfo.DomainName)
		minioConsoleRule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/minio`)", Data.PlatformInfo.DomainName)
		minioRedirectRegex := fmt.Sprintf("%s/(minio*)", Data.PlatformInfo.DomainName)
		minioRedirectReplacement := fmt.Sprintf("%s/$${1}", Data.PlatformInfo.DomainName)
		minioAnottations := swarm.Annotations{
			Name: "minio",
			Labels: map[string]string{
				"app":                                 "osi4iot",
				"service_type":                        "minio",
				"traefik.enable":                      "true",
				"traefik.http.routers.minio_api.rule": minioRule,
				"traefik.http.routers.minio_api.entrypoints":                                               "websecure",
				"traefik.http.routers.minio_api.tls":                                                       "true",
				"traefik.http.routers.minio_api.tls.certresolver":                                          resolver,
				"traefik.http.routers.minio_api.service":                                                   "minio",
				"traefik.http.services.minio.loadbalancer.server.port":                                     "9000",
				"traefik.http.services.minio.loadbalancer.healthCheck.path":                                "/minio/health/live",
				"traefik.http.services.minio.loadbalancer.healthCheck.interval":                            "5s",
				"traefik.http.services.minio.loadbalancer.healthCheck.timeout":                             "3s",
				"traefik.http.routers.minio_console.rule":                                                  minioConsoleRule,
				"traefik.http.middlewares.minio_console-prefix.stripprefix.prefixes":                       "/minio",
				"traefik.http.routers.minio_console.middlewares":                                           "minio_console-prefix,minio_console-header,minio_console-redirectregex",
				"traefik.http.middlewares.minio_console-prefix.stripprefix.forceslash":                     "false",
				"traefik.http.middlewares.minio_console-header.headers.customrequestheaders.X-Script-Name": "/minio/",
				"traefik.http.middlewares.minio_console-redirectregex.redirectregex.regex":                 minioRedirectRegex,
				"traefik.http.middlewares.minio_console-redirectregex.redirectregex.replacement":           minioRedirectReplacement,
				"traefik.http.routers.minio_console.entrypoints":                                           "websecure",
				"traefik.http.routers.minio_console.tls":                                                   "true",
				"traefik.http.routers.minio_console.tls.certresolver":                                      resolver,
				"traefik.http.routers.minio_console.service":                                               "minio_console",
				"traefik.http.services.minio_console.loadbalancer.server.port":                             "9090",
			},
		}
		minioTaskTemplate := swarm.TaskSpec{
			ContainerSpec: &swarm.ContainerSpec{
				Image: "ghcr.io/osi4iot/minio:RELEASE.2023-10-16T04-13-43Z",
				Labels: map[string]string{
					"app": "osi4iot",
				},
				Hostname: "minio",
				Env: []string{
					"MINIO_VOLUMES=/mnt/data",
					fmt.Sprintf("MINIO_BROWSER_REDIRECT_URL=https://%s/minio", Data.PlatformInfo.DomainName),
					fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
				},
				Args: []string{
					"server",
					"--console-address",
					":9090",
					"/mnt/data",
				},
				Secrets: []*swarm.SecretReference{
					{
						File: &swarm.SecretReferenceFileTarget{
							Name: "/run/secrets/minio.txt",
							UID:  "0",
							GID:  "0",
							Mode: 0444,
						},
						SecretID:   swarmData.Secrets["minio"].ID,
						SecretName: swarmData.Secrets["minio"].Name,
					},
				},
				Mounts: []mount.Mount{
					{
						Type:   mount.TypeVolume,
						Source: swarmData.Volumes["minio_storage"].Name,
						Target: "/mnt/data",
					},
				},
			},
			Resources: &swarm.ResourceRequirements{
				Limits: &swarm.Limit{
					NanoCPUs:    giveCPUs("minio"),
					MemoryBytes: giveMemory("minio"),
				},
				Reservations: &swarm.Resources{
					NanoCPUs:    giveCPUs("minio"),
					MemoryBytes: giveMemory("minio"),
				},
			},
			Placement: &swarm.Placement{
				Constraints: workerConstraintsArray,
			},
		}
		minioEndpointSpec := &swarm.EndpointSpec{
			Mode: swarm.ResolutionModeVIP,
		}
		minioMode := swarm.ServiceMode{
			Replicated: &swarm.ReplicatedService{
				Replicas: giveReplicsPtr("minio"),
			},
		}
		minioUpdateConfig := &swarm.UpdateConfig{
			Parallelism:     2,
			Delay:           time.Duration(5 * time.Second),
			FailureAction:   swarm.UpdateFailureActionRollback,
			Monitor:         time.Duration(20 * time.Second),
			MaxFailureRatio: 0.2,
			Order:           "start-first",
		}
		minioRollbackConfig := &swarm.UpdateConfig{
			Parallelism:     2,
			Delay:           time.Duration(5 * time.Second),
			FailureAction:   swarm.UpdateFailureActionRollback,
			Monitor:         time.Duration(20 * time.Second),
			MaxFailureRatio: 0.2,
			Order:           "start-first",
		}
		minioNetwork := []swarm.NetworkAttachmentConfig{
			{Target: swarmData.Networks["internal_net"].Name},
			{Target: swarmData.Networks["traefik_public"].Name},
		}
		Services["minio"] = Service{
			Name:           "minio",
			Annotations:    minioAnottations,
			TaskTemplate:   minioTaskTemplate,
			EndpointSpec:   minioEndpointSpec,
			Mode:           minioMode,
			UpdateConfig:   minioUpdateConfig,
			RollbackConfig: minioRollbackConfig,
			Networks:       minioNetwork,
		}
	}

	if deploymentMode == "development" {
		pgadmin4Rule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/pgadmin4/`)", Data.PlatformInfo.DomainName)
		pgadmin4RedirectRegex := fmt.Sprintf("%s/(pgadmin4*)", Data.PlatformInfo.DomainName)
		pgadmin4RedirectRepalcement := fmt.Sprintf("%s/$${1}", Data.PlatformInfo.DomainName)
		pgadmin4Anottations := swarm.Annotations{
			Name: "pgadmin4",
			Labels: map[string]string{
				"app":                                "osi4iot",
				"service_type":                       "pgadmin4",
				"traefik.enable":                     "true",
				"traefik.http.routers.pgadmin4.rule": pgadmin4Rule,
				"traefik.http.middlewares.pgadmin4-prefix.stripprefix.prefixes":                       "/pgadmin4",
				"traefik.http.routers.pgadmin4.middlewares":                                           "pgadmin4-prefix,pgadmin4-header,pgadmin4-redirectregex",
				"traefik.http.middlewares.pgadmin4-prefix.stripprefix.forceslash":                     "false",
				"traefik.http.middlewares.pgadmin4-header.headers.customrequestheaders.X-Script-Name": "/pgadmin4/",
				"traefik.http.middlewares.pgadmin4-redirectregex.redirectregex.regex":                 pgadmin4RedirectRegex,
				"traefik.http.middlewares.pgadmin4-redirectregex.redirectregex.replacement":           pgadmin4RedirectRepalcement,
				"traefik.http.routers.pgadmin4.entrypoints":                                           "websecure",
				"traefik.http.routers.pgadmin4.tls":                                                   "true",
				"traefik.http.routers.pgadmin4.tls.certresolver":                                      resolver,
				"traefik.http.routers.pgadmin4.service":                                               "pgadmin4",
				"traefik.http.services.pgadmin4.loadbalancer.server.port":                             "80",
			},
		}
		pgadmin4TaskTemplate := swarm.TaskSpec{
			ContainerSpec: &swarm.ContainerSpec{
				Image: "ghcr.io/osi4iot/pgadmin4:2023-10-18-2",
				Labels: map[string]string{
					"app": "osi4iot",
				},
				User: "0:0",
				Env: []string{
					fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
				},
				Secrets: []*swarm.SecretReference{
					{
						File: &swarm.SecretReferenceFileTarget{
							Name: "pgadmin4.txt",
							UID:  "0",
							GID:  "0",
							Mode: 0444,
						},
						SecretID:   swarmData.Secrets["pgadmin4"].ID,
						SecretName: swarmData.Secrets["pgadmin4"].Name,
					},
				},
				Mounts: []mount.Mount{
					{
						Type:   mount.TypeVolume,
						Source: swarmData.Volumes["pgadmin4_data"].Name,
						Target: "/var/lib/pgadmin",
					},
				},
			},
			Resources: &swarm.ResourceRequirements{
				Limits: &swarm.Limit{
					NanoCPUs:    giveCPUs("pgadmin4"),
					MemoryBytes: giveMemory("pgadmin4"),
				},
				Reservations: &swarm.Resources{
					NanoCPUs:    giveCPUs("pgadmin4"),
					MemoryBytes: giveMemory("pgadmin4"),
				},
			},
			Placement: &swarm.Placement{
				Constraints: workerConstraintsArray,
			},
		}
		pgadmin4EndpointSpec := &swarm.EndpointSpec{
			Mode: swarm.ResolutionModeVIP,
		}
		pgadmin4Mode := swarm.ServiceMode{
			Replicated: &swarm.ReplicatedService{
				Replicas: giveReplicsPtr("pgadmin4"),
			},
		}
		pgadmin4UpdateConfig := &swarm.UpdateConfig{
			Parallelism:     2,
			Delay:           time.Duration(5 * time.Second),
			FailureAction:   swarm.UpdateFailureActionRollback,
			Monitor:         time.Duration(20 * time.Second),
			MaxFailureRatio: 0.2,
			Order:           "start-first",
		}
		pgadmin4RollbackConfig := &swarm.UpdateConfig{
			Parallelism:     2,
			Delay:           time.Duration(5 * time.Second),
			FailureAction:   swarm.UpdateFailureActionRollback,
			Monitor:         time.Duration(20 * time.Second),
			MaxFailureRatio: 0.2,
			Order:           "start-first",
		}
		pgadmin4Network := []swarm.NetworkAttachmentConfig{
			{Target: swarmData.Networks["internal_net"].Name},
			{Target: swarmData.Networks["traefik_public"].Name},
		}
		Services["pgadmin4"] = Service{
			Name:           "pgadmin4",
			Annotations:    pgadmin4Anottations,
			TaskTemplate:   pgadmin4TaskTemplate,
			EndpointSpec:   pgadmin4EndpointSpec,
			Mode:           pgadmin4Mode,
			UpdateConfig:   pgadmin4UpdateConfig,
			RollbackConfig: pgadmin4RollbackConfig,
			Networks:       pgadmin4Network,
		}
	}

	var nriConstraintsArray []string
	for _, org := range Data.Certs.MqttCerts.Organizations {
		orgAcronym := org.OrgAcronym
		orgAcronymLower := strings.ToLower(orgAcronym)

		if numSwarmNodes == 1 {
			nriConstraintsArray = []string{
				"node.role==manager",
			}
		} else {
			if len(org.ExclusiveWorkerNodes) != 0 {
				nriConstraintsArray = []string{
					"node.role==worker",
					fmt.Sprintf("node.labels.org_hash==%s", org.OrgHash),
				}
			} else {
				nriConstraintsArray = []string{
					"node.role==worker",
					"node.labels.generic_org_worker==true",
				}
			}
		}

		for _, nri := range org.NodeRedInstances {
			nriHash := nri.NriHash
			serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronymLower, nriHash)
			nodeRedInstanceHashPath := fmt.Sprintf("nodered_%s", nriHash)
			isVolumeCreated := nri.IsVolumeCreated
			mqttClientCert := fmt.Sprintf("%s_%s_cert", orgAcronymLower, nriHash)
			mqttClientKey := fmt.Sprintf("%s_%s_key", orgAcronymLower, nriHash)

			domainName := Data.PlatformInfo.DomainName
			nriAnottations := swarm.Annotations{
				Name: serviceName,
				Labels: map[string]string{
					"app":            "osi4iot",
					"service_type":   "nodered_instance",
					"traefik.enable": "true",
					fmt.Sprintf("traefik.http.routers.%s.rule", serviceName): fmt.Sprintf(
						"Host(`%s`) && PathPrefix(`/%s/`)",
						domainName,
						nodeRedInstanceHashPath,
					),
					fmt.Sprintf("traefik.http.middlewares.%s-prefix.stripprefix.prefixes", serviceName): fmt.Sprintf(
						"/%s",
						nodeRedInstanceHashPath,
					),
					fmt.Sprintf("traefik.http.routers.%s.middlewares", serviceName): fmt.Sprintf(
						"%s-prefix,%s-header,%s-redirectregex",
						serviceName,
						serviceName,
						serviceName,
					),
					fmt.Sprintf("traefik.http.middlewares.%s-prefix.stripprefix.forceslash", serviceName): "false",
					fmt.Sprintf("traefik.http.middlewares.%s-header.headers.customrequestheaders.X-Script-Name", serviceName): fmt.Sprintf(
						"/%s/",
						nodeRedInstanceHashPath,
					),
					fmt.Sprintf("traefik.http.middlewares.%s-redirectregex.redirectregex.regex", serviceName): fmt.Sprintf(
						"%s/(%s*)",
						domainName,
						nodeRedInstanceHashPath,
					),
					fmt.Sprintf("traefik.http.middlewares.%s-redirectregex.redirectregex.replacement", serviceName): fmt.Sprintf(
						"%s/$${1}",
						domainName,
					),
					fmt.Sprintf("traefik.http.routers.%s.entrypoints", serviceName):               "websecure",
					fmt.Sprintf("traefik.http.routers.%s.tls", serviceName):                       "true",
					fmt.Sprintf("traefik.http.routers.%s.tls.certresolver", serviceName):          resolver,
					fmt.Sprintf("traefik.http.routers.%s.service", serviceName):                   serviceName,
					fmt.Sprintf("traefik.http.services.%s.loadbalancer.server.port", serviceName): "1880",
				},
			}
			nriTaskTemplate := swarm.TaskSpec{
				ContainerSpec: &swarm.ContainerSpec{
					Image: "ghcr.io/osi4iot/nodered_instance:1.3.0",
					Labels: map[string]string{
						"app": "osi4iot",
					},
					Env: []string{
						fmt.Sprintf("TZ=%s", Data.PlatformInfo.DefaultTimeZone),
						fmt.Sprintf("NODERED_INSTANCE_HASH=%s", nriHash),
						fmt.Sprintf("IS_NODERED_INSTANCE_VOLUME_ALREADY_CREATED=%s", isVolumeCreated),
					},
					Secrets: []*swarm.SecretReference{
						{
							File: &swarm.SecretReferenceFileTarget{
								Name: "/data/certs/ca.crt",
								UID:  "0",
								GID:  "0",
								Mode: 0444,
							},
							SecretID:   swarmData.Secrets["mqtt_certs_ca_cert"].ID,
							SecretName: swarmData.Secrets["mqtt_certs_ca_cert"].Name,
						},
						{
							File: &swarm.SecretReferenceFileTarget{
								Name: "/data/certs/client.crt",
								UID:  "0",
								GID:  "0",
								Mode: 0444,
							},
							SecretID:   swarmData.Secrets[mqttClientCert].ID,
							SecretName: swarmData.Secrets[mqttClientCert].Name,
						},
						{
							File: &swarm.SecretReferenceFileTarget{
								Name: "/data/certs/client.key",
								UID:  "0",
								GID:  "0",
								Mode: 0444,
							},
							SecretID:   swarmData.Secrets[mqttClientKey].ID,
							SecretName: swarmData.Secrets[mqttClientKey].Name,
						},
					},
					Mounts: []mount.Mount{
						{
							Type:   mount.TypeVolume,
							Source: swarmData.Volumes[serviceName].Name,
							Target: "/data",
						},
					},
				},
				Resources: &swarm.ResourceRequirements{
					Limits: &swarm.Limit{
						NanoCPUs:    giveCPUs("nodered_instance"),
						MemoryBytes: giveMemory("nodered_instance"),
					},
					Reservations: &swarm.Resources{
						NanoCPUs:    giveCPUs("nodered_instance"),
						MemoryBytes: giveMemory("nodered_instance"),
					},
				},
				Placement: &swarm.Placement{
					Constraints: nriConstraintsArray,
				},
			}
			nriEndpointSpec := &swarm.EndpointSpec{
				Mode: swarm.ResolutionModeVIP,
			}
			nriMode := swarm.ServiceMode{
				Replicated: &swarm.ReplicatedService{
					Replicas: giveReplicsPtr("nodered_instance"),
				},
			}
			nriUpdateConfig := &swarm.UpdateConfig{
				Parallelism:     2,
				Delay:           time.Duration(5 * time.Second),
				FailureAction:   swarm.UpdateFailureActionRollback,
				Monitor:         time.Duration(20 * time.Second),
				MaxFailureRatio: 0.2,
				Order:           "start-first",
			}
			nriRollbackConfig := &swarm.UpdateConfig{
				Parallelism:     2,
				Delay:           time.Duration(5 * time.Second),
				FailureAction:   swarm.UpdateFailureActionRollback,
				Monitor:         time.Duration(20 * time.Second),
				MaxFailureRatio: 0.2,
				Order:           "start-first",
			}
			nriNetwork := []swarm.NetworkAttachmentConfig{
				{Target: swarmData.Networks["internal_net"].Name},
				{Target: swarmData.Networks["traefik_public"].Name},
			}
			Services[serviceName] = Service{
				Name:           serviceName,
				Annotations:    nriAnottations,
				TaskTemplate:   nriTaskTemplate,
				EndpointSpec:   nriEndpointSpec,
				Mode:           nriMode,
				UpdateConfig:   nriUpdateConfig,
				RollbackConfig: nriRollbackConfig,
				Networks:       nriNetwork,
			}
		}
	}

	return Services
}

func durationPtr(d time.Duration) *time.Duration {
	return &d
}

func giveCPUs(serviceName string) int64 {
	numSwarmNodes := len(Data.PlatformInfo.NodesData)
	numCpuPerNode := Data.PlatformInfo.NumberOfCPUsPerNode
	cpus := 0.25 * 1e9
	switch serviceName {
	case "system_prune":
		cpus = 0.25
	case "traefik":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.15
			} else {
				cpus = 0.25
			}
		} else {
			cpus = 0.50
		}
	case "mosquitto":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.30
			} else {
				cpus = 0.50
			}
		} else {
			cpus = 0.50
		}
	case "postgres":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.25
			} else {
				cpus = 0.50
			}
		} else {
			cpus = 0.50
		}
	case "timescaledb":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.25
			} else {
				cpus = 0.50
			}
		} else {
			cpus = 0.50
		}
	case "s3_storage":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.15
			} else {
				cpus = 0.25
			}
		} else {
			cpus = 0.50
		}
	case "dev2pdb":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.25
			} else {
				cpus = 0.25
			}
		} else {
			cpus = 0.50
		}
	case "grafana":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.2
			} else {
				cpus = 0.50
			}
		} else {
			cpus = 0.50
		}
	case "admin_api":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.30
			} else {
				cpus = 0.50
			}
		} else {
			cpus = 0.50
		}
	case "frontend":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.25
			} else {
				cpus = 0.25
			}
		} else {
			cpus = 0.50
		}
	case "agent":
		cpus = 0.10
	case "portainer":
		cpus = 0.10
	case "pgadmin4":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.15
			} else {
				cpus = 0.25
			}
		} else {
			cpus = 0.25
		}
	case "minio":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.30
			} else {
				cpus = 0.50
			}
		} else {
			cpus = 0.50
		}
	case "grafana_renderer":
		if numSwarmNodes == 1 {
			if numCpuPerNode == "4" {
				cpus = 0.25
			} else {
				cpus = 0.50
			}
		} else {
			cpus = 0.50
		}
	case "keepalived":
		cpus = 0.25
	case "nodered_instance":
		cpus = 0.50
	default:
		cpus = 0.25
	}
	return int64(cpus * 1e9)
}

func giveMemory(serviceName string) int64 {
	memoryPerNode := Data.PlatformInfo.RAMMemoryPerNode
	memory := 100
	switch serviceName {
	case "system_prune":
		memory = 50
	case "traefik":
		memory = 250
	case "mosquitto":
		memory = 500
	case "postgres":
		memory = 500
	case "timescaledb":
		memory = 500
	case "s3_storage":
		memory = 250
	case "dev2pdb":
		memory = 500
	case "grafana":
		memory = 500
	case "admin_api":
		memory = 1000
	case "frontend":
		memory = 500
	case "agent":
		memory = 100
	case "portainer":
		memory = 100
	case "pgadmin4":
		memory = 500
	case "minio":
		memory = 500
	case "grafana_renderer":
		memory = 500
	case "keepalived":
		memory = 50
	case "nodered_instance":
		if memoryPerNode == "4 GiB" || memoryPerNode == "8 GiB" {
			memory = 2048
		} else if memoryPerNode == "16 GiB" || memoryPerNode == "32 GiB" {
			memory = 4096
		}
	default:
		memory = 100
	}

	return int64(memory * 1024 * 1024)
}

func giveReplicsPtr(serviceName string) *uint64 {
	replics := uint64(1)
	numSwarmNodes := len(Data.PlatformInfo.NodesData)
	switch serviceName {
	case "system_prune":
		replics = uint64(1)
	case "traefik":
		replics = uint64(1)
	case "mosquitto_go_auth":
		replics = uint64(1)
	case "postgres":
		replics = uint64(1)
	case "timescaledb":
		replics = uint64(1)
	case "s3_storage":
		replics = uint64(1)
	case "dev2pdb":
		replics = uint64(1)
	case "grafana":
		if numSwarmNodes == 1 {
			replics = uint64(1)
		} else {
			replics = uint64(3)
		}
	case "admin_api":
		if numSwarmNodes == 1 {
			replics = uint64(1)
		} else {
			replics = uint64(3)
		}
	case "frontend":
		if numSwarmNodes == 1 {
			replics = uint64(1)
		} else {
			replics = uint64(3)
		}
	case "agent":
		replics = uint64(1)
	case "portainer":
		replics = uint64(1)
	case "pgadmin4":
		replics = uint64(1)
	case "minio":
		replics = uint64(1)
	case "grafana_renderer":
		replics = uint64(1)
	case "keepalived":
		replics = uint64(1)
	case "nodered_instance":
		replics = uint64(1)
	default:
		replics = uint64(1)
	}
	return &replics
}
