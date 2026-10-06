package data

import (
	"fmt"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/volume"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// SetInitialPlatformState determines the platform's state for this run
// (see the PlatformStatus constants), asking Swarm.
//
// Two things it does NOT do any more, both of which made a running
// platform look deleted or stuck:
//
//   - Count nodes. A node that is down, rebooting or just removed is a
//     problem of availability — Degraded at worst — never a platform
//     that does not exist. Deciding Deleted from it also let `create`
//     run over a live platform.
//   - Inspect containers through the manager's Docker. A manager only
//     sees its own containers, so every task on a worker counted as not
//     running. It is not needed either: Swarm keeps a task of a service
//     with a healthcheck in "starting" until its container is healthy,
//     so a task in "running" is a healthy one.
//
// Only an unreadable state file is an error; a swarm that cannot be
// asked is the Unknown state, with its reason in PlatformStateReason, so
// the command decides what it can still do.
func SetInitialPlatformState() error {
	PlatformStateReason = ""
	PlatformStateDetail = nil
	PlatformServices = nil
	if !utils.ExistStateFile() {
		PlatformState = Empty
		return nil
	}
	obs := observePlatform()
	PlatformState, PlatformStateReason, PlatformStateDetail = classifyPlatform(obs)
	for _, svc := range obs.Services {
		PlatformServices = append(PlatformServices, ServiceStatus(svc))
	}
	return nil
}

// serviceObservation is one of the platform's services as Swarm sees it.
type serviceObservation struct {
	Name     string
	Required int // tasks that should be running
	Running  int // tasks running (healthy, for services with a healthcheck)
}

// platformObservation is everything the state is decided from.
type platformObservation struct {
	ManagerErr  error // no manager could be asked
	SwarmActive bool
	ServicesErr error
	Services    []serviceObservation
	Volumes     int // the platform's volumes on the nodes that answered
	VolumesErr  error
}

// classifyPlatform decides the state from an observation. Pure, so the
// rules can be tested without a swarm.
func classifyPlatform(obs platformObservation) (PlatformStatus, string, []string) {
	if obs.ManagerErr != nil {
		return Unknown, fmt.Sprintf("no manager could be reached: %v", obs.ManagerErr), nil
	}
	if !obs.SwarmActive {
		return Deleted, "", nil
	}
	if obs.ServicesErr != nil {
		return Unknown, fmt.Sprintf("the services could not be listed: %v", obs.ServicesErr), nil
	}
	if len(obs.Services) > 0 {
		var short []string
		for _, svc := range obs.Services {
			if svc.Running < svc.Required {
				short = append(short, fmt.Sprintf("%s (%d/%d)", svc.Name, svc.Running, svc.Required))
			}
		}
		if len(short) > 0 {
			return Degraded, "", short
		}
		return Running, "", nil
	}
	if obs.VolumesErr != nil {
		return Unknown, fmt.Sprintf("the volumes could not be listed: %v", obs.VolumesErr), nil
	}
	if obs.Volumes > 0 {
		return Stopped, "", nil
	}
	return Deleted, "", nil
}

// observePlatform asks Swarm what classifyPlatform needs.
func observePlatform() platformObservation {
	var obs platformObservation

	dc, err := docker.GetManagerDC()
	if err != nil {
		obs.ManagerErr = err
		return obs
	}
	info, err := dc.Cli.Info(dc.Ctx)
	if err != nil {
		obs.ManagerErr = err
		return obs
	}
	obs.SwarmActive = info.Swarm.LocalNodeState == swarm.LocalNodeStateActive && info.Swarm.ControlAvailable
	if !obs.SwarmActive {
		return obs
	}

	platformFilter := filters.NewArgs()
	platformFilter.Add("label", "app=osi4iot")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{Filters: platformFilter})
	if err != nil {
		obs.ServicesErr = err
		return obs
	}

	for _, service := range services {
		if service.Spec.Name == "system-prune" {
			continue
		}
		taskFilter := filters.NewArgs()
		taskFilter.Add("service", service.ID)
		// Only the tasks Swarm wants running: the history of replaced
		// and shut-down ones is in the list too.
		taskFilter.Add("desired-state", "running")
		tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: taskFilter})
		if err != nil {
			obs.ServicesErr = err
			return obs
		}
		svc := serviceObservation{Name: service.Spec.Name}
		for _, task := range tasks {
			if task.Status.State == swarm.TaskStateRunning {
				svc.Running++
			}
		}
		switch {
		case service.Spec.Mode.Replicated != nil && service.Spec.Mode.Replicated.Replicas != nil:
			svc.Required = int(*service.Spec.Mode.Replicated.Replicas)
		default:
			// Global: one task per node Swarm placed it on.
			svc.Required = len(tasks)
		}
		obs.Services = append(obs.Services, svc)
	}

	if len(obs.Services) == 0 {
		for _, nodeDC := range pt.DCMap {
			if nodeDC == nil || nodeDC.Cli == nil {
				continue // an unreachable node: its volumes are not counted
			}
			list, err := nodeDC.Cli.VolumeList(nodeDC.Ctx, volume.ListOptions{Filters: platformFilter})
			if err != nil {
				obs.VolumesErr = err
				return obs
			}
			obs.Volumes += len(list.Volumes)
		}
	}
	return obs
}

func SetInitialServicesData(pd *pt.PlatformData) {
	pd.PlatformInfo.ServicesData = []pt.ServiceData{}
	defaultServicesDataMap := utils.GetDefaultServicesDataMap(pd)
	for _, svcData := range defaultServicesDataMap {
		pd.PlatformInfo.ServicesData = append(pd.PlatformInfo.ServicesData, svcData)
	}
}

func CreateGeoJsonFiles() error {
	mainOrgBuildingPath := Data.PlatformInfo.MainOrganizationBuildingPath
	mainOrgBuildingData := Data.PlatformInfo.MainOrganizationBuilding
	if mainOrgBuildingPath != "" && mainOrgBuildingData != "" && !utils.ExistFile(mainOrgBuildingPath) {
		err := utils.WriteToFile(mainOrgBuildingPath, []byte(mainOrgBuildingData), 0644)
		if err != nil {
			return err
		}
	}

	mainOrgFirstFloorPath := Data.PlatformInfo.MainOrganizationFirstFloorPath
	mainOrgFirstFloorData := Data.PlatformInfo.MainOrganizationFirstFloor
	if mainOrgFirstFloorPath != "" && mainOrgFirstFloorData != "" && !utils.ExistFile(mainOrgFirstFloorPath) {
		err := utils.WriteToFile(mainOrgFirstFloorPath, []byte(mainOrgFirstFloorData), 0644)
		if err != nil {
			return err
		}
	}
	return nil
}

func CreateDomainCertsFiles() error {
	if Data.PlatformInfo.DomainCertsType == "Certs provided by an CA" {
		privateKeyPath := Data.PlatformInfo.DOMAIN_SSL_PRIVATE_KEY_PATH
		privateKey := Data.Certs.DomainCerts.PrivateKey
		if privateKeyPath != "" && privateKey != "" && !utils.ExistFile(privateKeyPath) {
			err := utils.WriteToFile(privateKeyPath, []byte(privateKey), 0644)
			if err != nil {
				return err
			}
		}

		caPemPath := Data.PlatformInfo.DOMAIN_SSL_CA_PEM_PATH
		caPem := Data.Certs.DomainCerts.SslCaPem
		if caPemPath != "" && caPem != "" && !utils.ExistFile(caPemPath) {
			err := utils.WriteToFile(caPemPath, []byte(caPem), 0644)
			if err != nil {
				return err
			}
		}

		certPath := Data.PlatformInfo.DOMAIN_SSL_CERT_CRT_PATH
		cert := Data.Certs.DomainCerts.SslCertCrt
		if certPath != "" && cert != "" && !utils.ExistFile(certPath) {
			err := utils.WriteToFile(certPath, []byte(cert), 0644)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func CreateSSHKeysFile() error {
	awsKeyPath := Data.PlatformInfo.AwsSshKeyPath
	awsKey := Data.PlatformInfo.AwsSshKey
	if awsKeyPath != "" && awsKey != "" && !utils.ExistFile(awsKeyPath) {
		err := utils.WriteToFile(awsKeyPath, []byte(awsKey), 0600)
		if err != nil {
			return err
		}
	}

	sshPrivKeyPath := Data.PlatformInfo.SshPrivKeyPath
	sshPrivKey := Data.PlatformInfo.SshPrivKey
	if sshPrivKeyPath != "" && sshPrivKey != "" && !utils.ExistFile(sshPrivKeyPath) {
		err := utils.WriteToFile(sshPrivKeyPath, []byte(sshPrivKey), 0600)
		if err != nil {
			return err
		}
	}

	sshPubKeyPath := Data.PlatformInfo.SshPubKeyPath
	sshPubKey := Data.PlatformInfo.SshPubKey
	if sshPubKeyPath != "" && sshPubKey != "" && !utils.ExistFile(sshPubKeyPath) {
		err := utils.WriteToFile(sshPubKeyPath, []byte(sshPubKey), 0600)
		if err != nil {
			return err
		}
	}

	return nil
}

func GetServiceDataByName(serviceName string) *pt.ServiceData {
	servicesData := Data.PlatformInfo.ServicesData
	for _, svcData := range servicesData {
		if svcData.ServiceName == serviceName {
			return &svcData
		}
	}
	return nil
}

