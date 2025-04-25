package docker

import (
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

type NriData struct {
	org              common.Organization
	nri              common.NodeRedInstance
	resources        *swarm.ResourceRequirements
	replicas         *uint64
	constraintsArray []string
	resolver         string
}

func nriService(platformData *common.PlatformData, nriData NriData, swarmData SwarmData) Service {
	orgAcronym := nriData.org.OrgAcronym
	orgAcronymLower := strings.ToLower(orgAcronym)
	resolver := nriData.resolver

	nriHash := nriData.nri.NriHash
	serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronymLower, nriHash)
	volumeName := fmt.Sprintf("%s_data", serviceName)
	nodeRedInstanceHashPath := fmt.Sprintf("nodered_%s", nriHash)
	isVolumeCreated := nriData.nri.IsVolumeCreated
	mqttClientCert := fmt.Sprintf("%s_%s_cert", orgAcronymLower, nriHash)
	mqttClientKey := fmt.Sprintf("%s_%s_key", orgAcronymLower, nriHash)

	domainName := platformData.PlatformInfo.DomainName
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
				fmt.Sprintf("TZ=%s", platformData.PlatformInfo.DefaultTimeZone),
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
					Source: swarmData.Volumes[volumeName].Name,
					Target: "/data",
				},
			},
		},
		Resources: nriData.resources,
		Placement: &swarm.Placement{
			Constraints: nriData.constraintsArray,
		},
	}
	nriEndpointSpec := &swarm.EndpointSpec{
		Mode: swarm.ResolutionModeVIP,
	}
	nriMode := swarm.ServiceMode{
		Replicated: &swarm.ReplicatedService{
			Replicas: nriData.replicas,
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

	nriService := Service{
		Name:           serviceName,
		Annotations:    nriAnottations,
		TaskTemplate:   nriTaskTemplate,
		EndpointSpec:   nriEndpointSpec,
		Mode:           nriMode,
		UpdateConfig:   nriUpdateConfig,
		RollbackConfig: nriRollbackConfig,
		Networks:       nriNetwork,
	}

	return nriService
}

func nriVolumesDataMap(platformData *common.PlatformData, newOrg common.Organization) map[string]Volume {
	orgAcronym := strings.ToLower(newOrg.OrgAcronym)
	nriVolumesData := make(map[string]Volume)

	for _, nri := range newOrg.NodeRedInstances {
		nriHash := nri.NriHash
		serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
		volumeName := fmt.Sprintf("%s_data", serviceName)
		nriVolume := Volume{
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

func createNriSwarmVolumes(platformData *common.PlatformData, newOrg common.Organization) (map[string]Volume, error) {
	numNodes := len(platformData.PlatformInfo.NodesData)
	errors := []error{}
	nriVolumesMap := nriVolumesDataMap(platformData, newOrg)
	for _, dc := range DCMap {
		if numNodes > 1 && dc.Node.NodeRole != "Generic org worker" {
			continue
		}

		for key, volume := range nriVolumesMap {
			err := createVolume(dc, &volume)
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

func createNriSwarmSecrets(dc *DockerClient, platformData *common.PlatformData, newOrg common.Organization) (map[string]Secret, error) {
	nriSecrets := make(map[string]Secret)
	generateNriSecrets([]common.Organization{newOrg}, nriSecrets)

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
	nriSecrets["mqtt_certs_ca_cert"] = Secret{
		ID:   mqttCertsCaCertSecrets[0].ID,
		Name: mqttCertsCaCertSecrets[0].Spec.Name,
	}
	
	for key, secret := range nriSecrets {
		err := createSecret(dc, key, &secret)
		if err != nil {
			return nil, fmt.Errorf("error creating secret %s: %v", key, err)
		}
		nriSecrets[key] = secret
	}

	return nriSecrets, nil
}

func CreateNriServices(newOrg common.Organization, platformData *common.PlatformData) error {
	dc, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}
	nodeRoleNumMap := getNodeRoleNumMap(platformData)
	roleMemoryBytesMap := getNodeMemoryBytesMap(platformData)
	roleNanoCPUsMap := getNodeNanoCpusMap(platformData)
	nriReplicas := giveReplicsPtr(nodeRoleNumMap, "nodered_instance")
	domainCertsType := platformData.PlatformInfo.DomainCertsType
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)
	var nriConstraintsArray []string
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
	nriResources := &swarm.ResourceRequirements{
		Limits: &swarm.Limit{
			NanoCPUs:    giveCPUs("nodered_instance", nodeRoleNumMap, roleNanoCPUsMap),
			MemoryBytes: giveMemory("nodered_instance", roleMemoryBytesMap),
		},
		Reservations: &swarm.Resources{
			NanoCPUs:    giveCPUs("nodered_instance", nodeRoleNumMap, roleNanoCPUsMap),
			MemoryBytes: giveMemory("nodered_instance", roleMemoryBytesMap),
		},
	}
	existArmArchNodes := false
	for _, node := range platformData.PlatformInfo.NodesData {
		if node.NodeArch == "aarch64" {
			existArmArchNodes = true
			break
		}
	}

	if numSwarmNodes == 1 && existArmArchNodes {
		nriResources = &swarm.ResourceRequirements{}
	}

	resolver := ""
	if domainCertsType[0:19] == "Let's encrypt certs" {
		if domainCertsType == "Let's encrypt certs with HTTP-01 challenge" {
			resolver = "httpresolver"
		} else if domainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
			resolver = "route53resolver"
		}
	}

	nriVolumesMap, err := createNriSwarmVolumes(platformData, newOrg)
	if err != nil {
		return err
	}

	nriSecrets, err := createNriSwarmSecrets(dc, platformData, newOrg)
	if err != nil {
		return err
	}

	nriNetworks := GenerateNetworks(platformData)

	swarmData := SwarmData{
		Configs: nil,
		Secrets: nriSecrets,
		Volumes: nriVolumesMap,
		Networks: nriNetworks,
	}

	for _, nri := range newOrg.NodeRedInstances {
		nriData := NriData{
			org:              newOrg,
			nri:              nri,
			resources:        nriResources,
			replicas:         nriReplicas,
			constraintsArray: nriConstraintsArray,
			resolver:         resolver,
		}

		nriService := nriService(platformData, nriData, swarmData)
		err := createService(dc, nriService)
		if err != nil {
			return err
		}
	}

	return nil
}

func RemoveNriServices(org common.Organization) error {
	dc, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	servicesToRemove := []string{}
	for _, nri := range org.NodeRedInstances {
		serviceName := fmt.Sprintf("org_%s_nri_%s", strings.ToLower(org.OrgAcronym), nri.NriHash)
		servicesToRemove = append(servicesToRemove, serviceName)
	}

	err= removeServicesByName(dc, servicesToRemove)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	return nil
}
