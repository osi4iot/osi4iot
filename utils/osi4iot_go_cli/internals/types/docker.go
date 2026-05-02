package types

import (
	"context"
	"fmt"

	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/client"

)

type Secret struct {
	Name string
	Data string
	ID   string
}

type Config struct {
	Name string
	Data string
	ID   string
}

type Network struct {
	ID     string
	Name   string
	Driver string
}

type Volume struct {
	Name       string
	Driver     string
	ID         string
	DriverOpts map[string]string
}

type Service struct {
	Name           string
	Annotations    swarm.Annotations
	TaskTemplate   swarm.TaskSpec
	EndpointSpec   *swarm.EndpointSpec
	Mode           swarm.ServiceMode
	UpdateConfig   *swarm.UpdateConfig
	RollbackConfig *swarm.UpdateConfig
}

type SwarmData struct {
	Secrets  map[string]Secret
	Configs  map[string]Config
	Volumes  map[string]Volume
	Networks map[string]Network
}

type DockerClient struct {
	Cli  *client.Client
	Ctx  context.Context
	Node NodeData
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

var DCMap = make(map[string]*DockerClient)
