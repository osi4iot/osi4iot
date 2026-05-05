package docker

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"

	"github.com/docker/docker/client"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

var once sync.Once
var sshPrivKeyTempFile *os.File

func getNodeDockerClient(node pt.NodeData, deploymentLocation string, sshPrivKeyTempFile *os.File) (*pt.DockerClient, error) {
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

	dc := &pt.DockerClient{
		Cli:  cli,
		Ctx:  context.Background(),
		Node: node,
	}

	return dc, nil
}

type DcResp struct {
	IP           string
	DockerClient *pt.DockerClient
	Err          error
}

func SetDockerClientsMap(platformData *pt.PlatformData, action string) (map[string]*pt.DockerClient, error) {
	var swarmErr error = nil
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	if deploymentLocation == "" {
		return nil, fmt.Errorf("deployment location is not set")
	}
	nodesData := platformData.PlatformInfo.NodesData
	actionsWithSpinner := []string{"init", "update", "run", "stop"}

	once.Do(func() {
		var err error
		sshPrivKeyTempFile, err = utils.CreateSshPrivKeyTempFile(platformData)
		if err != nil {
			swarmErr = fmt.Errorf("error creating ssh private key temp file: %v", err)
			return
		}

		var wg sync.WaitGroup
		dcResponses := make(chan DcResp, len(nodesData))
		var spinnerDone chan bool
		if slices.Contains(actionsWithSpinner, action) {
			spinnerDone = make(chan bool)
			spinnerMsg := "Getting docker clients from each node"
			endMsg := "Docker clients of all nodes have been successfully obtained."
			utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		}

		for _, node := range nodesData {
			wg.Add(1)
			go func(node pt.NodeData) {
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
				pt.DCMap[resp.IP] = nil
			} else {
				pt.DCMap[resp.IP] = resp.DockerClient
			}
		}

		if slices.Contains(actionsWithSpinner, action) {
			if len(errorLines) > 0 {
				spinnerDone <- false
			} else {
				spinnerDone <- true
			}
		}

		if len(errorLines) > 0 {
			swarmErr = fmt.Errorf("%s", strings.Join(errorLines, "\n"))
		}
	})

	return pt.DCMap, swarmErr
}

func CheckDockerClientsMap(DCMap map[string]*pt.DockerClient, action string) error {
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

func CloseDockerClientsMap() error {
	for _, dc := range pt.DCMap {
		if dc != nil {
			err := dc.Close()
			if err != nil {
				return fmt.Errorf("error closing docker client: %v", err)
			}
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
