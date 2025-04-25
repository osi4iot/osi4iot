package docker

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/client"
	"github.com/docker/docker/errdefs"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

type SwarmData struct {
	Secrets  map[string]Secret
	Configs  map[string]Config
	Volumes  map[string]Volume
	Networks map[string]Network
}

//var swarmData SwarmData

type DockerClient struct {
	Cli  *client.Client
	Ctx  context.Context
	Node common.NodeData
}

var DCMap = make(map[string]*DockerClient)
var sshPrivKeyTempFile *os.File
var once sync.Once

func InitPlatform(platformData *common.PlatformData) error {
	nodesData := platformData.PlatformInfo.NodesData
	organizations := platformData.Certs.MqttCerts.Organizations
	for orgIdx, org := range organizations {
		for nriIdx, nri := range org.NodeRedInstances {
			if nri.IsVolumeCreated == "true" {
				platformData.Certs.MqttCerts.Organizations[orgIdx].NodeRedInstances[nriIdx].IsVolumeCreated = "false"
			}
		}
	}

	err := initSwarm()
	if err != nil {
		return fmt.Errorf("error: initializing swarm %s", err.Error())
	}

	dc, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error: getting docker client %s", err.Error())
	}
	err = nodesConfiguration(platformData)
	if err != nil {
		return fmt.Errorf("error: configuring nodes %s", err.Error())
	}

	err = joinAllNodesToSwarm(dc)
	if err != nil {
		return fmt.Errorf("error: joining nodes to swarm %s", err.Error())
	}

	err = updateNodesData(dc, nodesData)
	if err != nil {
		return fmt.Errorf("error: updating nodes data %s", err.Error())
	}
	platformData.PlatformInfo.NodesData = nodesData

	err = RunSwarm(dc, platformData)
	if err != nil {
		return fmt.Errorf("error: running swarm %s", err.Error())
	}

	return nil
}

func (dc *DockerClient) Close() error {

	if dc.Cli != nil {
		err := dc.Cli.Close()
		if err != nil {
			return fmt.Errorf("error closing docker client: %v", err)
		}
	}

	return nil
}

func RunSwarm(dc *DockerClient, platformData *common.PlatformData) error {
	secrets, err := createSwarmSecrets(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm secrets: %v", err)
	}

	configs, err := createSwarmConfigs(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm configs: %v", err)
	}

	volumes, err := createSwarmVolumes(platformData)
	if err != nil {
		return fmt.Errorf("error creating swarm volumes: %v", err)
	}

	networks, err := createSwarmNetworks(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm networks: %v", err)
	}

	swarmData := SwarmData{
		Secrets:  secrets,
		Configs:  configs,
		Volumes:  volumes,
		Networks: networks,
	}

	err = createSwarmServices(platformData, dc, swarmData)
	if err != nil {
		return fmt.Errorf("error creating swarm services: %v", err)
	}

	return nil
}

func createService(dc *DockerClient, swarmService Service) error {
	existingServices, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	serviceExists := false
	for _, s := range existingServices {
		if s.Spec.Name == swarmService.Name {
			serviceExists = true
			break
		}
	}

	if !serviceExists {
		_, err := dc.Cli.ServiceCreate(dc.Ctx, swarm.ServiceSpec{
			Annotations:  swarmService.Annotations,
			TaskTemplate: swarmService.TaskTemplate,
			EndpointSpec: swarmService.EndpointSpec,
			Mode:         swarmService.Mode,
			Networks:     swarmService.Networks,
		}, types.ServiceCreateOptions{})
		if err != nil {
			return fmt.Errorf("error creating service: %v", err)
		}
	}
	return nil
}

func StopPlatform(platformData *common.PlatformData) error {
	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}
	err = removeSwarmServices(docker)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	return nil
}

func DeletePlatform(platformData *common.PlatformData) error {
	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	done := make(chan bool)
	spinnerMsg := "Waiting for all components to be deleted"
	endMsg := "All components have been deleted successfully"
	utils.Spinner(spinnerMsg, endMsg, done)
	err = removeSwarmServices(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing services: %v", err)
	}

	err = removeSwarmSecrets(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing secrets: %v", err)
	}

	err = removeSwarmConfigs(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing configs: %v", err)
	}

	err = removeSwarmNetworks(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing networks: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	containers, err := docker.Cli.ContainerList(docker.Ctx, container.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		done <- false
		return fmt.Errorf("error listing containers: %v", err)
	}

	for {
		if len(containers) == 0 {
			break
		}
		containers, err = docker.Cli.ContainerList(docker.Ctx, container.ListOptions{
			Filters: filterArgs,
		})
		if err != nil {
			if errdefs.IsNotFound(err) {
				continue
			}
			done <- false
			return fmt.Errorf("error listing containers: %v", err)
		}
	}

	timeOut := false
	for i := 0; i <= 60; i++ {
		time.Sleep(1 * time.Second) // wait for containers to stop completely
		err = removeSwarmVolumes(platformData)
		if err == nil {
			break
		}
		if i == 60 {
			timeOut = true
		}
	}

	if timeOut {
		done <- false
		return fmt.Errorf("error timeout removing volumes: %v", err)
	}
	done <- true

	err = removeNfsRootFolder(platformData)
	if err != nil {
		return fmt.Errorf("error removing NFS root folder: %v", err)
	}

	err = removeEfsRootFolder(platformData)
	if err != nil {
		return fmt.Errorf("error removing EFS root folder: %v", err)
	}

	err = nodesLeaveSwarm()
	if err != nil {
		return fmt.Errorf("error leaving swarm: %v", err)
	}

	err = utils.WritePlatformDataToFile(platformData)
	if err != nil {
		return fmt.Errorf("error writing platform data to file: %v", err)
	}

	return nil
}

func waitUntilAllContainersAreHealthy(serviceType string) error {
	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	deadline := time.Now().Add(10 * time.Minute)

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := docker.Cli.ServiceList(docker.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	var filteredServices []swarm.Service
	if serviceType != "all" {
		for _, service := range services {
			if val, ok := service.Spec.Labels["service_type"]; ok && val == serviceType {
				filteredServices = append(filteredServices, service)
			}
		}
	} else {
		filteredServices = services
	}

	done := make(chan bool)
	spinnerMsg := "Waiting for all containers to be healthy"
	endMsg := "All containers are healthy"
	if serviceType != "all" {
		spinnerMsg = fmt.Sprintf("Waiting for containers of service %s to be healthy", serviceType)
		endMsg = fmt.Sprintf("All containers of service %s are healthy", serviceType)
	}
	utils.Spinner(spinnerMsg, endMsg, done)

	for {
		if time.Now().After(deadline) {
			done <- false
			return fmt.Errorf("timeout waiting for all containers to be healthy")
		}

		allHealthy := true

		for _, service := range filteredServices {
			if service.Spec.Name == "system-prune" {
				continue
			}

			serviceFilter := filters.NewArgs()
			serviceFilter.Add("service", service.ID)
			tasks, err := docker.Cli.TaskList(docker.Ctx, types.TaskListOptions{
				Filters: serviceFilter,
			})
			if err != nil {
				allHealthy = false
				continue
			}

			numTasksRunning := 0
			for _, task := range tasks {
				if task.Status.State != swarm.TaskStateRunning {
					continue
				}
				numTasksRunning++

				containerID := task.Status.ContainerStatus.ContainerID
				if containerID == "" {
					allHealthy = false
					continue
				}

				container, err := docker.Cli.ContainerInspect(docker.Ctx, containerID)
				if err != nil {
					if errdefs.IsNotFound(err) {
						continue
					}
					allHealthy = false
					continue
				}

				if container.State.Health == nil {
					done <- false
					return fmt.Errorf("error container %s does not have a health check configured", containerID[:10])
				}

				if container.State.Health.Status != "healthy" {
					allHealthy = false
				}
			}

			if numTasksRunning == 0 {
				allHealthy = false
			}
		}

		if allHealthy {
			break
		}

		time.Sleep(5 * time.Second)
	}

	done <- true

	return nil
}

func findOrgAndNriIndex(platformData *common.PlatformData, orgAcronym string, nriHash string) (int, int) {
	orgIndex := -1
	nriIndex := -1
	for orgIdx, org := range platformData.Certs.MqttCerts.Organizations {
		if strings.ToLower(org.OrgAcronym) == orgAcronym {
			for nriIdx, nri := range org.NodeRedInstances {
				if nri.NriHash == nriHash {
					orgIndex = orgIdx
					nriIndex = nriIdx
					break
				} else {
					continue
				}
			}
		} else {
			continue
		}
	}
	return orgIndex, nriIndex
}

func SwarmInitiationInfo(platformData *common.PlatformData, okMessage string) error {
	err := waitUntilAllContainersAreHealthy("all")
	if err != nil {
		errMsg := utils.StyleErrMsg.Render("error waiting for the platform to be healthy: ", err.Error())
		fmt.Println(errMsg)
	} else {
		areNewNriVolumesCreated, err := setNriVolumesAsCreated(platformData)
		if err != nil {
			errMsg := utils.StyleErrMsg.Render("error setting nri volumes as created: ", err.Error())
			fmt.Println(errMsg)
		} else {
			if areNewNriVolumesCreated {
				err := waitUntilAllContainersAreHealthy("nodered_instances")
				if err != nil {
					errMsg := utils.StyleErrMsg.Render("error waiting nri is to be healthy: ", err.Error())
					fmt.Println(errMsg)
				} else {
					err = utils.WritePlatformDataToFile(platformData)
					if err != nil {
						return fmt.Errorf("error writing platform data to file: %v", err)
					}
					okMsg := utils.StyleOKMsg.Render(okMessage)
					fmt.Println(okMsg)
				}
			} else {
				err = utils.WritePlatformDataToFile(platformData)
				if err != nil {
					return fmt.Errorf("error writing platform data to file: %v", err)
				}
				okMsg := utils.StyleOKMsg.Render(okMessage)
				fmt.Println(okMsg)
			}
		}
	}

	return nil
}

func getNodeDockerClient(node common.NodeData, deploymentLocation string, sshPrivKeyTempFile *os.File) (*DockerClient, error) {
	var cli *client.Client
	runningInLocalHost, err := utils.IsHostIP(node.NodeIP)
	if err != nil {
		return nil, fmt.Errorf("error getting host IP: %v", err)
	}

	if deploymentLocation == "Local deployment" || runningInLocalHost {
		cli, err = client.NewClientWithOpts(
			client.FromEnv,
			client.WithAPIVersionNegotiation(),
		)
		if err != nil {
			return nil, fmt.Errorf("error creating docker client in node %s: %v", node.NodeIP, err)
		}
	} else if deploymentLocation == "On-premise cluster deployment" || deploymentLocation == "AWS cluster deployment" {
		daemonUrl := fmt.Sprintf("ssh://%s@%s:22", node.NodeUserName, node.NodeIP)
		helper, err := getConnectionHelper(daemonUrl, sshPrivKeyTempFile)
		if err != nil {
			panic(fmt.Errorf("error obteniendo el helper SSH: %w", err))
		}

		httpClient := &http.Client{
			Transport: &http.Transport{
				DialContext: helper.Dialer,
			},
		}

		cli, err = client.NewClientWithOpts(
			client.WithHost(helper.Host),
			client.WithHTTPClient(httpClient),
			client.WithDialContext(helper.Dialer),
			client.WithAPIVersionNegotiation(),
		)

		if err != nil {
			return nil, fmt.Errorf("error creating docker client: %v", err)
		}
	}

	dc := &DockerClient{
		Cli:  cli,
		Ctx:  context.Background(),
		Node: node,
	}

	return dc, nil
}

type DcResp struct {
	IP           string
	DockerClient *DockerClient
	Err          error
}

func SetDockerClientsMap(platformData *common.PlatformData, action string) (map[string]*DockerClient, error) {
	var swarmErr error = nil
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	if deploymentLocation == "" {
		return nil, fmt.Errorf("deployment location is not set")
	}
	nodesData := platformData.PlatformInfo.NodesData

	once.Do(func() {
		var err error
		sshPrivKeyTempFile, err = utils.CreateSshPrivKeyTempFile(platformData)
		if err != nil {
			swarmErr = fmt.Errorf("error creating ssh private key temp file: %v", err)
			return
		}

		var wg sync.WaitGroup
		dcResponses := make(chan DcResp, len(nodesData))

		spinnerDone := make(chan bool)
		spinnerMsg := "Getting docker clients from each node"
		endMsg := "Docker clients of all nodes have been successfully obtained."
		if action == "org" {
			endMsg = ""
		}
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		for _, node := range nodesData {
			wg.Add(1)
			go func(node common.NodeData) {
				defer wg.Done()
				dc, err := getNodeDockerClient(node, deploymentLocation, sshPrivKeyTempFile)
				dcResponses <- DcResp{IP: node.NodeIP, DockerClient: dc, Err: err}
			}(node)
		}
		wg.Wait()
		close(dcResponses)

		errorLines := []string{}
		for resp := range dcResponses {
			if resp.Err != nil {
				errorLines = append(errorLines, fmt.Sprintf("error getting docker client in node %s: %v", resp.IP, resp.Err.Error()))
				DCMap[resp.IP] = nil
			} else {
				DCMap[resp.IP] = resp.DockerClient
			}
		}
		if len(errorLines) > 0 {
			swarmErr = fmt.Errorf("%s", strings.Join(errorLines, "\n"))
			spinnerDone <- false
		} else {
			spinnerDone <- true
		}
	})

	return DCMap, swarmErr
}

func CheckDockerClientsMap(DCMap map[string]*DockerClient, action string) error {
	if len(DCMap) == 0 {
		return fmt.Errorf("error: failed to get any docker client")
	}
	numManagers := 0
	existNilMap := false
	for _, dc := range DCMap {
		if dc == nil {
			existNilMap = true
		} else {
			if dc.Node.NodeRole == "Manager" {
				numManagers++
			}
		}
	}

	if action == "init" {
		if existNilMap {
			return fmt.Errorf("error")
		}
	} else {
		if numManagers == 0 {
			return fmt.Errorf("error")
		}
	}

	return nil
}

func RemoveSshPrivKeyTempFile() error {
	if sshPrivKeyTempFile != nil {
		existsSshPrivateKeyFile := utils.ExistFile(sshPrivKeyTempFile.Name())
		if existsSshPrivateKeyFile {
			err := os.Remove(sshPrivKeyTempFile.Name())
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func CloseDockerClientsMap() error {
	for _, dc := range DCMap {
		if dc != nil {
			err := dc.Close()
			if err != nil {
				return fmt.Errorf("error closing docker client: %v", err)
			}
		}
	}

	return nil
}

func CheckSwarmInitiation(platformData *common.PlatformData) (bool, error) {
	nodesData := platformData.PlatformInfo.NodesData
	clusterId := ""
	var managerClient *DockerClient
	for _, node := range nodesData {
		if node.NodeRole == "Manager" {
			dc := DCMap[node.NodeIP]
			if dc == nil {
				return false, fmt.Errorf("error getting docker client for node %s", node.NodeIP)
			}

			info, err := dc.Cli.Info(dc.Ctx)
			if err != nil {
				return false, fmt.Errorf("error getting docker info: %v", err)
			}

			if !info.Swarm.ControlAvailable {
				return false, nil
			} else {
				if info.Swarm.Cluster != nil {
					if clusterId == "" {
						clusterId = info.Swarm.Cluster.ID
					} else if clusterId != info.Swarm.Cluster.ID {
						return false, nil
					}
				}
			}
			if managerClient == nil {
				managerClient = dc
			}
		}
	}

	swarmNodes, err := managerClient.Cli.NodeList(managerClient.Ctx, types.NodeListOptions{})
	if err != nil {
		return false, fmt.Errorf("error listing swarm nodes: %v", err)
	}

	swarmNodeIpMap := make(map[string]swarm.Node)
	for _, node := range swarmNodes {
		swarmNodeIpMap[node.Status.Addr] = node
	}

	for _, node := range nodesData {
		if _, ok := swarmNodeIpMap[node.NodeIP]; !ok {
			return false, nil
		}
	}

	return true, nil
}

func initSwarm() error {
	managerClient, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting manager docker client: %v", err)
	}

	info, err := managerClient.Cli.Info(managerClient.Ctx)
	if err != nil {
		return fmt.Errorf("error getting docker info: %v", err)
	}

	node := managerClient.Node
	nodeIP := node.NodeIP
	if nodeIP == "localhost" {
		nodeIP, err = utils.GetLocalNodeIP()
		if err != nil {
			return fmt.Errorf("error getting local node IP: %v", err)
		}
	}
	if !info.Swarm.ControlAvailable {
		advertiseAddr := fmt.Sprintf("%s:2377", nodeIP)
		_, err := managerClient.Cli.SwarmInit(managerClient.Ctx, swarm.InitRequest{
			AdvertiseAddr: advertiseAddr,
			ListenAddr:    "0.0.0.0:2377",
		})
		if err != nil {
			return fmt.Errorf("error initializing swarm: %v", err)
		}
	}

	err = joinAllNodesToSwarm(managerClient)
	if err != nil {
		return fmt.Errorf("error joining nodes to swarm: %v", err)
	} else {
		fmt.Println("Swarm has been initiated successfully")
	}

	return nil
}

func GetImages(dc *DockerClient) error {
	images, err := dc.Cli.ImageList(dc.Ctx, image.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing images: %v", err)
	}

	for _, image := range images {
		fmt.Println(image.ID)
	}

	return nil
}

func CleanResources() error {
	if err := RemoveSshPrivKeyTempFile(); err != nil {
		return fmt.Errorf("error removing ssh private key temp file: %v", err)
	}

	if err := CloseDockerClientsMap(); err != nil {
		return fmt.Errorf("error closing resources: %v", err)
	}
	return nil
}

func removeServicesByName(dc *DockerClient, svcNamesToRemove []string) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	errors := []string{}
	for _, service := range services {
		serviceName := service.Spec.Name
		if slices.Contains(svcNamesToRemove, serviceName) {
			err := dc.Cli.ServiceRemove(dc.Ctx, service.ID)
			if err != nil {
				errors = append(errors, fmt.Sprintf("error removing service %s: %v", serviceName, err))
			}
		}
	}
	if len(errors) > 0 {
		return fmt.Errorf("%s", strings.Join(errors, "\n"))
	}

	return nil
}
