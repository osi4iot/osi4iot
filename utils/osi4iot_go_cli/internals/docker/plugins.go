package docker

import (
	"fmt"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func installRexRayPlugin(pd *types.PlatformData) error {
	pi := pd.PlatformInfo
	deploymentLocation := pi.DeploymentLocation

	useAwsEbsVolumes := pi.UseAwsEbsVolumes
	if (deploymentLocation == "Local deployment" && useAwsEbsVolumes) {
		useAwsEbsVolumes = true
	}

	if deploymentLocation == "AWS cluster deployment" {
		useAwsEbsVolumes = true
		pi.UseAwsEbsVolumes = true
	}

	if useAwsEbsVolumes {
		pluginName := "ghcr.io/osi4iot/rexray-ebs:latest"

		installScript := fmt.Sprintf(`
        # Check if the plugin is already installed
        if docker plugin ls --format '{{.Name}}' | grep -q "rexray-ebs"; then
			echo "rexray-ebs plugin already installed"
            exit 0
        fi

        # Install the plugin
        docker plugin install %s \
            --alias rexray-ebs \
            --grant-all-permissions

        # Verify installation
        if docker plugin ls --format '{{.Name}}' | grep -q "rexray-ebs"; then
			echo "rexray-ebs plugin installed successfully"
        else
            echo "Error: rexray-ebs plugin could not be installed" >&2
            exit 1
        fi
    `, pluginName)

		nodes := pd.PlatformInfo.NodesData
		if len(nodes) == 0 {
			return fmt.Errorf("no nodes found in platform data")
		}

		// Build the list of nodeScripts for all nodes
		nodeScripts := make([]utils.NodeScript, len(nodes))
		for i, node := range nodes {
			nodeScripts[i] = utils.NodeScript{
				Node:   node,
				Script: installScript,
			}
		}

		responses, err := utils.RunScriptInNodes(pd, nodeScripts)
		if err != nil {
			return fmt.Errorf("error installing rexray plugin: %w", err)
		}

		for i, resp := range responses {
			fmt.Printf("Node %s: %s\n", nodes[i].NodeIP, resp)
		}
	}

	return nil
}

func uninstallRexRayPlugin(pd *types.PlatformData) error {
	if !pd.PlatformInfo.UseAwsEbsVolumes {
		return nil
	}

	nodes := pd.PlatformInfo.NodesData
	if len(nodes) == 0 {
		return fmt.Errorf("no nodes found in platform data")
	}

	uninstallScript := `
        if ! docker plugin ls --format '{{.Name}}' | grep -q "rexray-ebs"; then
            echo "not_installed"
            exit 0
        fi

        docker plugin disable rexray-ebs --force
        docker plugin rm rexray-ebs
        echo "uninstalled"
    `
	nodeScripts := make([]utils.NodeScript, len(nodes))
	for i, node := range nodes {
		nodeScripts[i] = utils.NodeScript{
			Node:   node,
			Script: uninstallScript,
		}
	}

	responses, err := utils.RunScriptInNodes(pd, nodeScripts)
	if err != nil {
		return fmt.Errorf("error uninstalling rexray plugin: %w", err)
	}

	uninstalled := 0
	alreadyRemoved := 0
	for _, resp := range responses {
		switch strings.TrimSpace(resp) {
		case "uninstalled":
			uninstalled++
		case "not_installed":
			alreadyRemoved++
		}
	}

	if uninstalled > 0 {
		fmt.Printf("rexray-ebs plugin uninstalled successfully on %d node(s)\n", uninstalled)
	}
	if alreadyRemoved > 0 {
		fmt.Printf("rexray-ebs plugin was not installed on %d node(s)\n", alreadyRemoved)
	}

	return nil
}
