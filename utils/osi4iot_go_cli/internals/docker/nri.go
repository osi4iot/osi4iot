package docker

import (
	"fmt"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/networks"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/secrets"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/services"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/volumes"
)

func createNriSwarmVolumes(platformData *pt.PlatformData, org pt.Organization) (map[string]pt.Volume, error) {
	numNodes := len(platformData.PlatformInfo.NodesData)
	errors := []error{}
	nriVolumesMap := volumes.NriVolumesDataMap(platformData, org)
	for _, dc := range pt.DCMap {
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

func createNriSwarmSecrets(dc *pt.DockerClient, platformData *pt.PlatformData, org pt.Organization) (map[string]pt.Secret, error) {
	nriSecrets := make(map[string]pt.Secret)
	messagingSystem := platformData.PlatformInfo.MessagingSystem
	secrets.GenerateNriSecrets(messagingSystem, []pt.Organization{org}, nriSecrets)

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
		nriSecrets["mqtt_certs_ca_cert"] = pt.Secret{
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

func CreateNriSwarmServices(pd *pt.PlatformData, dc *pt.DockerClient) error {
	nriNetworks := networks.GenerateNetworks(pd)

	nriVolumes := make(map[string]pt.Volume)
	nriSecrets := make(map[string]pt.Secret)
	for _, org := range pd.Organizations {
		nriVolumesInOrg, err := createNriSwarmVolumes(pd, org)
		if err != nil {
			return err
		}

		for key, volume := range nriVolumesInOrg {
			nriVolumes[key] = volume
		}

		nriSecretsInOrg, err := createNriSwarmSecrets(dc, pd, org)
		if err != nil {
			return err
		}

		for key, secret := range nriSecretsInOrg {
			nriSecrets[key] = secret
		}
	}

	swarmData := pt.SwarmData{
		Configs:  nil,
		Secrets:  nriSecrets,
		Volumes:  nriVolumes,
		Networks: nriNetworks,
	}

	nriServices := services.CreateNriServices(pd, dc, swarmData)
	for key, service := range nriServices {
		err := CreateSwarmService(dc, service)
		if err != nil {
			return fmt.Errorf("error creating service %s: %v", key, err)
		}
	}
	return nil
}

func CreateNriSwarmServicesForOrg(pd *pt.PlatformData, org pt.Organization) error {
	dc, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}
	nriNetworks := networks.GenerateNetworks(pd)

	nriVolumesMap, err := createNriSwarmVolumes(pd, org)
	if err != nil {
		return err
	}

	nriSecrets, err := createNriSwarmSecrets(dc, pd, org)
	if err != nil {
		return err
	}

	swarmData := pt.SwarmData{
		Configs:  nil,
		Secrets:  nriSecrets,
		Volumes:  nriVolumesMap,
		Networks: nriNetworks,
	}

	nriServices := services.CreateNriServices(pd, dc, swarmData)
	for key, service := range nriServices {
		err := CreateSwarmService(dc, service)
		if err != nil {
			return fmt.Errorf("error creating service %s: %v", key, err)
		}
	}
	return nil
}

func RemoveNriSwarmServicesInOrg(org pt.Organization) error {
	dc, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	servicesToRemove := []string{}
	for _, nri := range org.NodeRedInstances {
		serviceName := fmt.Sprintf("org_%s_nri_%s", strings.ToLower(org.OrgAcronym), nri.NriHash)
		servicesToRemove = append(servicesToRemove, serviceName)
	}

	err = RemoveSwarmServicesByName(dc, servicesToRemove)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	return nil
}
