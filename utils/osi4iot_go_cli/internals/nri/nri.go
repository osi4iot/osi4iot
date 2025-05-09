package nri

import (
	"fmt"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/networks"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/secrets"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/services"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/volumes"
)

type NriData struct {
	org              common.Organization
	nri              common.NodeRedInstance
	resources        *swarm.ResourceRequirements
	constraintsArray []string
}

func NriService(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps, nriData NriData) dt.Service {
	orgAcronym := nriData.org.OrgAcronym
	orgAcronymLower := strings.ToLower(orgAcronym)
	messagingSystem := pd.PlatformInfo.MessagingSystem

	nriHash := nriData.nri.NriHash
	serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronymLower, nriHash)
	volumeName := fmt.Sprintf("%s_data", serviceName)
	nodeRedInstanceHashPath := fmt.Sprintf("nodered_%s", nriHash)
	mqttClientCert := fmt.Sprintf("%s_%s_cert", orgAcronymLower, nriHash)
	mqttClientKey := fmt.Sprintf("%s_%s_key", orgAcronymLower, nriHash)
	nriNatsSecretsKey := fmt.Sprintf("%s_%s_nats", orgAcronymLower, nriHash)

	domainName := pd.PlatformInfo.DomainName

	annotationsLabels := map[string]string{
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
		fmt.Sprintf("traefik.http.routers.%s.tls.certresolver", serviceName):          "",
		fmt.Sprintf("traefik.http.routers.%s.service", serviceName):                   serviceName,
		fmt.Sprintf("traefik.http.services.%s.loadbalancer.server.port", serviceName): "1880",
	}

	secrets := []*swarm.SecretReference{}
	if messagingSystem == "mqtt" {
		mqttSecrets := []*swarm.SecretReference{
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "/data/certs/ca.crt",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets["mqtt_certs_ca_cert"].ID,
				SecretName: sd.Secrets["mqtt_certs_ca_cert"].Name,
			},
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "/data/certs/client.crt",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets[mqttClientCert].ID,
				SecretName: sd.Secrets[mqttClientCert].Name,
			},
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "/data/certs/client.key",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets[mqttClientKey].ID,
				SecretName: sd.Secrets[mqttClientKey].Name,
			},
		}
		secrets = append(secrets, mqttSecrets...)
	} else if messagingSystem == "nats" {
		natsSecrets := []*swarm.SecretReference{
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "/data/certs/nri_credentials",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets[nriNatsSecretsKey].ID,
				SecretName: sd.Secrets[nriNatsSecretsKey].Name,
			},
		}
		secrets = append(secrets, natsSecrets...)
	}

	return services.NewService(serviceName, pd, sd).
		WithImage("ghcr.io/osi4iot/nodered_instance_nats:1.3.0").
		WithAnnotationsLabels(annotationsLabels).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volumeName].Name,
				Target: "/data",
			},
		}).
		WithResources(
			resources.CPUs("nodered_instance", nodeRoleMaps),
			resources.Memory("nodered_instance", nodeRoleMaps),
		).
		WithPlacement(nriData.constraintsArray).
		WithModeReplicated(resources.GiveReplicsPtr("nodered_instance", nodeRoleMaps)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}

func nriVolumesDataMap(platformData *common.PlatformData, newOrg common.Organization) map[string]dt.Volume {
	orgAcronym := strings.ToLower(newOrg.OrgAcronym)
	nriVolumesData := make(map[string]dt.Volume)

	for _, nri := range newOrg.NodeRedInstances {
		nriHash := nri.NriHash
		serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
		volumeName := fmt.Sprintf("%s_data", serviceName)
		nriVolume := dt.Volume{
			Name:       volumeName,
			Driver:     "local",
			DriverOpts: map[string]string{},
		}

		nodesData := platformData.PlatformInfo.NodesData
		numSwarmNodes := len(nodesData)
		deploymentLocation := platformData.PlatformInfo.DeploymentLocation
		if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
			nfsServerIP := ""
			for _, node := range nodesData {
				if node.NodeRole == "NFS Server" {
					nfsServerIP = node.NodeIP
					break
				}
			}

			driverOptsO := fmt.Sprintf("nfsvers=4,addr=%s,rw", nfsServerIP)
			nriVolume.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": fmt.Sprintf(":/var/nfs_osi4iot/%s", volumeName),
			}
		} else if deploymentLocation == "AWS cluster deployment" && numSwarmNodes > 1 {
			awsEfsDNS := platformData.PlatformInfo.AwsEfsDNS
			driverOptsO := fmt.Sprintf("addr=%s,nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport", awsEfsDNS)
			serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
			volumeName := fmt.Sprintf("%s_data", serviceName)
			nriVolume.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": fmt.Sprintf("%s:/%s", awsEfsDNS, volumeName),
			}
		}
		nriVolumesData[volumeName] = nriVolume
	}

	return nriVolumesData
}

func createNriSwarmVolumes(platformData *common.PlatformData, newOrg common.Organization) (map[string]dt.Volume, error) {
	numNodes := len(platformData.PlatformInfo.NodesData)
	errors := []error{}
	nriVolumesMap := nriVolumesDataMap(platformData, newOrg)
	for _, dc := range dt.DCMap {
		if numNodes > 1 && dc.Node.NodeRole != "Generic org worker" {
			continue
		}

		for key, volume := range nriVolumesMap {
			err := volumes.CreateVolume(dc, &volume)
			if err != nil {
				errors = append(errors, fmt.Errorf("error creating volume %s in node %s: %v", volume.Name, dc.Node.NodeIP, err))
			}
			nriVolumesMap[key] = volume
		}
	}

	if len(errors) > 0 {
		return nil, fmt.Errorf("errors creating volumes: %v", errors)
	}

	return nriVolumesMap, nil
}

func createNriSwarmSecrets(dc *dt.DockerClient, platformData *common.PlatformData, newOrg common.Organization) (map[string]dt.Secret, error) {
	nriSecrets := make(map[string]dt.Secret)
	messagingSystem := platformData.PlatformInfo.MessagingSystem
	secrets.GenerateNriSecrets(messagingSystem, []common.Organization{newOrg}, nriSecrets)

	if messagingSystem == "mqtt" {
		filterArgs := filters.NewArgs()
		mqttCaCertHash := utils.GetMD5Hash(platformData.Certs.MqttCerts.CaCerts.CaCrt)
		mqttCaCertSecretName := fmt.Sprintf("mqtt_certs_ca_cert_%s", mqttCaCertHash)
		filterArgs.Add("name", mqttCaCertSecretName)
		mqttCertsCaCertSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{Filters: filterArgs})
		if err != nil {
			return nil, fmt.Errorf("error listing secrets: %v", err)
		}
		if len(mqttCertsCaCertSecrets) == 0 {
			return nil, fmt.Errorf("error getting secret %s", "mqtt_certs_ca_cert")
		}
		nriSecrets["mqtt_certs_ca_cert"] = dt.Secret{
			ID:   mqttCertsCaCertSecrets[0].ID,
			Name: mqttCertsCaCertSecrets[0].Spec.Name,
		}
	}

	for key, secret := range nriSecrets {
		err := secrets.CreateSecret(dc, key, &secret)
		if err != nil {
			return nil, fmt.Errorf("error creating secret %s: %v", key, err)
		}
		nriSecrets[key] = secret
	}

	return nriSecrets, nil
}

func CreateNriServicesForOrg(newOrg common.Organization, pd *common.PlatformData) error {
	dc, err := docker.GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	nodeRoleMaps := resources.NewNodeRoleMaps(pd)
	var nriConstraintsArray []string
	nriResources := &swarm.ResourceRequirements{
		Limits: &swarm.Limit{
			NanoCPUs:    resources.CPUs("nodered_instance", nodeRoleMaps),
			MemoryBytes: resources.Memory("nodered_instance", nodeRoleMaps),
		},
		Reservations: &swarm.Resources{
			NanoCPUs:    resources.CPUs("nodered_instance", nodeRoleMaps),
			MemoryBytes: resources.Memory("nodered_instance", nodeRoleMaps),
		},
	}
	numSwarmNodes := len(pd.PlatformInfo.NodesData)
	existArmArchNodes := false
	for _, node := range pd.PlatformInfo.NodesData {
		if node.NodeArch == "aarch64" {
			existArmArchNodes = true
			break
		}
	}

	if numSwarmNodes == 1 && existArmArchNodes {
		nriResources = &swarm.ResourceRequirements{}
	}

	if numSwarmNodes == 1 {
		nriConstraintsArray = []string{
			"node.role==manager",
		}
	} else {
		if len(newOrg.ExclusiveWorkerNodes) != 0 {
			nriConstraintsArray = []string{
				"node.role==worker",
				fmt.Sprintf("node.labels.org_hash==%s", newOrg.OrgHash),
			}
		} else {
			nriConstraintsArray = []string{
				"node.role==worker",
				"node.labels.generic_org_worker==true",
			}
		}
	}

	nriVolumesMap, err := createNriSwarmVolumes(pd, newOrg)
	if err != nil {
		return err
	}

	nriSecrets, err := createNriSwarmSecrets(dc, pd, newOrg)
	if err != nil {
		return err
	}

	nriNetworks := networks.GenerateNetworks(pd)

	swarmData := dt.SwarmData{
		Configs:  nil,
		Secrets:  nriSecrets,
		Volumes:  nriVolumesMap,
		Networks: nriNetworks,
	}

	for _, nri := range newOrg.NodeRedInstances {
		nriData := NriData{
			org:              newOrg,
			nri:              nri,
			resources:        nriResources,
			constraintsArray: nriConstraintsArray,
		}
		nriService := NriService(pd, swarmData, nodeRoleMaps, nriData)
		err := docker.CreateSwarmService(dc, nriService)
		if err != nil {
			return err
		}
	}

	return nil
}

func CreateNriServices(
	pd *common.PlatformData,
	sd dt.SwarmData,
	nodeRoleMaps resources.NodesRoleMaps,
) error {
	dc, err := docker.GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	var nriConstraintsArray []string
	nriResources := &swarm.ResourceRequirements{
		Limits: &swarm.Limit{
			NanoCPUs:    resources.CPUs("nodered_instance", nodeRoleMaps),
			MemoryBytes: resources.Memory("nodered_instance", nodeRoleMaps),
		},
		Reservations: &swarm.Resources{
			NanoCPUs:    resources.CPUs("nodered_instance", nodeRoleMaps),
			MemoryBytes: resources.Memory("nodered_instance", nodeRoleMaps),
		},
	}
	numSwarmNodes := len(pd.PlatformInfo.NodesData)
	existArmArchNodes := false
	for _, node := range pd.PlatformInfo.NodesData {
		if node.NodeArch == "aarch64" {
			existArmArchNodes = true
			break
		}
	}

	if numSwarmNodes == 1 && existArmArchNodes {
		nriResources = &swarm.ResourceRequirements{}
	}

	for _, org := range pd.Organizations {
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
			nriData := NriData{
				org:              org,
				nri:              nri,
				resources:        nriResources,
				constraintsArray: nriConstraintsArray,
			}
			nriService := NriService(pd, sd, nodeRoleMaps, nriData)
			err := docker.CreateSwarmService(dc, nriService)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func RemoveNriServices(org common.Organization) error {
	dc, err := docker.GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	servicesToRemove := []string{}
	for _, nri := range org.NodeRedInstances {
		serviceName := fmt.Sprintf("org_%s_nri_%s", strings.ToLower(org.OrgAcronym), nri.NriHash)
		servicesToRemove = append(servicesToRemove, serviceName)
	}

	err = docker.RemoveServicesByName(dc, servicesToRemove)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	return nil
}
