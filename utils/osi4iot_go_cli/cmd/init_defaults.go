package cmd

import (
	"fmt"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// `osi4iot init` deploys the images this CLI was released with
// (utils.GetDefaultServicesDataMap), not the ones recorded in the state
// file, which may come from an older CLI. --keep-images keeps the state
// file's images instead.
const keepImagesFlag = "keep-images"

// PrepareInitLocalNode fills NODES_DATA of a local deployment with this
// computer's data. Called from main.go for `init` right after the state
// file is read and BEFORE the Docker clients map is built: that map is
// keyed by the nodes' IPs, so it must already see this computer's.
// Other deployments are left alone: their nodes are other machines.
func PrepareInitLocalNode(pd *pt.PlatformData) error {
	if pd.PlatformInfo.DeploymentLocation != "Local deployment" {
		return nil
	}
	previous, err := utils.RefreshLocalNodeData(&pd.PlatformInfo)
	if err != nil {
		return fmt.Errorf("error getting this computer's node data: %w", err)
	}
	local := pd.PlatformInfo.NodesData[0]
	if previous.NodeIP != "" && (previous.NodeIP != local.NodeIP || previous.NodeHostName != local.NodeHostName) {
		fmt.Println(utils.StyleWarningMsg.Render(fmt.Sprintf(
			"Local deployment: the node of the state file (%s, %s) is replaced by this computer (%s, %s)",
			previous.NodeHostName, previous.NodeIP, local.NodeHostName, local.NodeIP)))
	}
	return nil
}

// applyInitDefaultImages sets the services to the CLI's default images,
// unless --keep-images, and says which ones changed. The state file is
// written with them when init finishes.
func applyInitDefaultImages(pd *pt.PlatformData, keepImages bool) {
	if keepImages {
		fmt.Println("Using the images of the state file (--" + keepImagesFlag + ")")
		return
	}
	changes := utils.ApplyDefaultServiceImages(pd)
	if len(changes) == 0 {
		return
	}
	fmt.Println(utils.StyleWarningMsg.Render(fmt.Sprintf(
		"%d service(s) will use this CLI's default image instead of the state file's (--%s to keep them):",
		len(changes), keepImagesFlag)))
	for _, c := range changes {
		from := c.From
		if from == "" {
			from = "(none)"
		}
		fmt.Printf("  %-22s %s -> %s\n", c.Service, from, c.To)
	}
}
