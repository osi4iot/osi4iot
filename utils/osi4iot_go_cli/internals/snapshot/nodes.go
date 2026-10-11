package snapshot

import (
	"encoding/json"
	"fmt"
	"net"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Node roles, exactly as ui/form/actions.go offers them. Comparisons
// against these strings are case sensitive throughout the CLI, so the
// canonical spellings live here and Validate rejects anything else
// rather than letting a silently unmatched role reach the deployment.
const (
	RoleManager        = "Manager"
	RolePlatformWorker = "Platform worker"
)

// Deployment locations, as ui/form/actions.go offers them.
const (
	LocationLocal     = "Local deployment"
	LocationOnPremise = "On-premise cluster deployment"
	LocationAWS       = "AWS cluster deployment"
)

var validRoles = []string{RoleManager, RolePlatformWorker}

var validLocations = []string{LocationLocal, LocationOnPremise, LocationAWS}

// nodesNote is embedded in nodes.json as "_note". JSON has no comments
// and this file is meant to be opened in an editor by someone who has
// never seen one before, so the instructions travel inside it.
const nodesNote = "Edit this file to describe the machines the platform will run on, " +
	"then pass the zip to 'osi4iot init --snapshot-file'. Roles are case sensitive: " +
	"\"Manager\", \"Platform worker\". nodeLabel is optional. nodePassword is exported empty " +
	"on purpose — fill it in only if the new nodes need an SSH password; leave it empty " +
	"to use the SSH key from the state file."

// NodesOverlay is the one part of the state file a bundle carries in
// plain text: the description of the machines, which is what changes
// when a platform moves and nothing else is.
//
// Everything else in the state file stays encrypted inside the zip.
// See the package doc for why.
type NodesOverlay struct {
	FormatVersion int    `json:"format_version"`
	Note          string `json:"_note"`

	DeploymentLocation string `json:"deployment_location"`
	DeploymentMode     string `json:"deployment_mode,omitempty"`
	NumberOfSwarmNodes int    `json:"number_of_swarm_nodes"`
	FloatingIPAddress  string `json:"floating_ip_address,omitempty"`
	NetworkInterface   string `json:"network_interface,omitempty"`

	Nodes []NodeOverlay `json:"nodes"`
}

// NodeOverlay is one machine. The JSON field names match NodeData's so
// anyone who has looked at a state file recognises them.
//
// The fields NodeData has and this does not — NodeId, NodeArch,
// NodeNanoCPUs, NodeMemoryBytes — are facts about the OLD hardware,
// discovered by docker.updateNodesData after the nodes join the swarm.
// Carrying them across would be carrying a lie, so ApplyNodes clears
// them and lets the swarm fill them in again.
type NodeOverlay struct {
	NodeLabel    string `json:"nodeLabel"`
	NodeIP       string `json:"nodeIP"`
	NodeRole     string `json:"nodeRole"`
	NodeUserName string `json:"nodeUserName"`
	NodeHostName string `json:"nodeHostName,omitempty"`

	// NodePassword is always written out EMPTY. The SSH password of
	// every node in the platform is not something to put in the one
	// plaintext file of a bundle that travels. An operator moving to
	// nodes that need a password fills it in themselves; one moving to
	// nodes reached by key leaves it alone.
	NodePassword string `json:"nodePassword"`
}

// ExtractNodes lifts the machine description out of a state file for
// writing into the bundle.
func ExtractNodes(pd *pt.PlatformData) NodesOverlay {
	overlay := NodesOverlay{
		FormatVersion: FormatVersion,
		Note:          nodesNote,
	}
	if pd == nil {
		return overlay
	}

	pi := pd.PlatformInfo
	overlay.DeploymentLocation = pi.DeploymentLocation
	overlay.DeploymentMode = pi.DeploymentMode
	overlay.NumberOfSwarmNodes = pi.NumberOfSwarmNodes
	overlay.FloatingIPAddress = pi.FloatingIPAddress
	overlay.NetworkInterface = pi.NetworkInterface

	overlay.Nodes = make([]NodeOverlay, 0, len(pi.NodesData))
	for _, node := range pi.NodesData {
		overlay.Nodes = append(overlay.Nodes, NodeOverlay{
			NodeLabel:    node.NodeLabel,
			NodeIP:       node.NodeIP,
			NodeRole:     node.NodeRole,
			NodeUserName: node.NodeUserName,
			NodeHostName: node.NodeHostName,
			// NodePassword deliberately omitted — see the field doc.
		})
	}
	return overlay
}

// Validate checks an overlay an operator may have edited by hand,
// before any of it reaches a deployment.
//
// The errors are the ones that would otherwise fail much later and much
// more confusingly: an empty IP surfaces as a Docker connection error against
// a host called "".
func (o *NodesOverlay) Validate() error {
	if o.FormatVersion > FormatVersion {
		return fmt.Errorf("nodes.json is format version %d and this CLI understands up to %d",
			o.FormatVersion, FormatVersion)
	}
	if len(o.Nodes) == 0 {
		return fmt.Errorf("nodes.json lists no nodes")
	}
	if o.DeploymentLocation == "" {
		return fmt.Errorf("nodes.json has no deployment_location (expected one of: %s)",
			strings.Join(quoteAll(validLocations), ", "))
	}
	if !contains(validLocations, o.DeploymentLocation) {
		return fmt.Errorf("deployment_location %q is not one of: %s",
			o.DeploymentLocation, strings.Join(quoteAll(validLocations), ", "))
	}
	if o.DeploymentLocation == LocationLocal && len(o.Nodes) != 1 {
		return fmt.Errorf("a %q has exactly one node, but nodes.json lists %d",
			LocationLocal, len(o.Nodes))
	}

	seenLabels := make(map[string]bool)
	seenIPs := make(map[string]bool)
	managers := 0
	workers := 0

	for i, node := range o.Nodes {
		where := nodeDescription(i, node)

		switch {
		// nodeLabel is NOT required. utils.GetLocalNodeData does not set
		// one, and the form only asks for a label on cluster
		// deployments, so a local platform legitimately has none. The
		// address is the real identity here — pt.DCMap is keyed by
		// NodeIP — and the label is what the operator reads in a
		// prompt.
		case node.NodeLabel != "" && seenLabels[node.NodeLabel]:
			return fmt.Errorf("two nodes share the label %q", node.NodeLabel)
		case node.NodeIP == "":
			return fmt.Errorf("%s has no nodeIP", where)
		case seenIPs[node.NodeIP]:
			return fmt.Errorf("two nodes share the address %q", node.NodeIP)
		case node.NodeRole == "":
			return fmt.Errorf("%s has no nodeRole (expected one of: %s)",
				where, strings.Join(quoteAll(validRoles), ", "))
		case !contains(validRoles, node.NodeRole):
			return fmt.Errorf("%s has role %q, which is not one of: %s "+
				"(the spelling is case sensitive)",
				where, node.NodeRole, strings.Join(quoteAll(validRoles), ", "))
		}

		// "localhost" is resolved to the machine's own address by
		// utils.fixingPlatformData, so it is allowed; anything else has
		// to parse, because a hostname here is not looked up anywhere.
		if node.NodeIP != "localhost" && net.ParseIP(node.NodeIP) == nil {
			return fmt.Errorf("%s has nodeIP %q, which is not an IP address",
				where, node.NodeIP)
		}

		if node.NodeRole == RoleManager {
			managers++
		}
		if node.NodeRole == RolePlatformWorker {
			workers++
		}

		if node.NodeLabel != "" {
			seenLabels[node.NodeLabel] = true
		}
		seenIPs[node.NodeIP] = true
	}

	if managers == 0 {
		return fmt.Errorf("no node has the role %q: a swarm needs at least one manager", RoleManager)
	}

	if o.DeploymentLocation != LocationLocal && workers == 0 {
		return fmt.Errorf("a %q needs at least one %q node", o.DeploymentLocation, RolePlatformWorker)
	}

	return nil
}

// Warnings returns the things that are probably wrong but that an
// operator may have meant. Kept separate from Validate so a deliberate
// choice is not turned into a hard stop, and so the caller decides
// whether to print them or to make them a confirmation.
func (o *NodesOverlay) Warnings() []string {
	var warnings []string

	managers := 0
	for _, node := range o.Nodes {
		switch node.NodeRole {
		case RoleManager:
			managers++
		}
	}

	if managers%2 == 0 {
		warnings = append(warnings, fmt.Sprintf(
			"%d managers: a swarm keeps quorum with an ODD number (1, 3 or 5)", managers))
	}
	if o.DeploymentLocation == LocationOnPremise && len(o.Nodes) > 1 {
		if o.FloatingIPAddress == "" {
			warnings = append(warnings, "floating_ip_address is empty, and keepalived needs one on a multi-node on-premise cluster")
		}
		if o.NetworkInterface == "" {
			warnings = append(warnings, "network_interface is empty, and keepalived needs one on a multi-node on-premise cluster")
		}
	}
	if len(o.Nodes) > 1 {
		unlabelled := 0
		for _, node := range o.Nodes {
			if node.NodeLabel == "" {
				unlabelled++
			}
		}
		if unlabelled > 0 {
			warnings = append(warnings, fmt.Sprintf(
				"%d of %d nodes have no nodeLabel; they will be identified only by address",
				unlabelled, len(o.Nodes)))
		}
	}
	if o.NumberOfSwarmNodes != 0 && o.NumberOfSwarmNodes != len(o.Nodes) {
		warnings = append(warnings, fmt.Sprintf(
			"number_of_swarm_nodes says %d but %d nodes are listed; the list wins",
			o.NumberOfSwarmNodes, len(o.Nodes)))
	}

	return warnings
}

// ApplyNodes overlays an edited nodes.json onto a state file decrypted
// from the same bundle.
//
// It replaces NodesData wholesale rather than merging: the operator's
// file is the statement of what the new deployment looks like, and a
// merge would quietly keep machines they deleted.
//
// Everything else in pd is left exactly as it was. That is the point of
// the split — the credentials, the certificates and the wal-g key come
// through untouched, which is what makes this a move of the same
// platform rather than the creation of a new one.
func ApplyNodes(pd *pt.PlatformData, o *NodesOverlay) error {
	if pd == nil {
		return fmt.Errorf("no platform data to apply the nodes to")
	}
	if o == nil {
		return fmt.Errorf("no nodes.json to apply")
	}
	if err := o.Validate(); err != nil {
		return err
	}

	nodesData := make([]pt.NodeData, 0, len(o.Nodes))
	for _, node := range o.Nodes {
		nodesData = append(nodesData, pt.NodeData{
			NodeLabel:    node.NodeLabel,
			NodeIP:       node.NodeIP,
			NodeRole:     node.NodeRole,
			NodeUserName: node.NodeUserName,
			NodePassword: node.NodePassword,
			NodeHostName: node.NodeHostName,
			// NodeId, NodeArch, NodeNanoCPUs and NodeMemoryBytes stay
			// zero: docker.updateNodesData fills them in from the new
			// swarm once the nodes have joined it.
		})
	}

	pd.PlatformInfo.NodesData = nodesData
	pd.PlatformInfo.NumberOfSwarmNodes = len(nodesData)
	pd.PlatformInfo.DeploymentLocation = o.DeploymentLocation
	if o.DeploymentMode != "" {
		pd.PlatformInfo.DeploymentMode = o.DeploymentMode
	}
	pd.PlatformInfo.FloatingIPAddress = o.FloatingIPAddress
	pd.PlatformInfo.NetworkInterface = o.NetworkInterface

	return nil
}

// encodeNodes renders the overlay for the archive.
func (o *NodesOverlay) encode() ([]byte, error) {
	// Written on the way out rather than trusted from the caller, so an
	// overlay built by hand still carries its instructions.
	o.FormatVersion = FormatVersion
	o.Note = nodesNote

	data, err := json.MarshalIndent(o, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("error serialising nodes.json: %w", err)
	}
	return append(data, '\n'), nil
}

func decodeNodes(data []byte) (*NodesOverlay, error) {
	var o NodesOverlay
	if err := json.Unmarshal(data, &o); err != nil {
		return nil, fmt.Errorf("nodes.json is not valid JSON: %w", err)
	}
	return &o, nil
}

// nodeDescription names a node for an error message, preferring the
// label and falling back to the position and address, since the label
// is optional.
func nodeDescription(index int, node NodeOverlay) string {
	switch {
	case node.NodeLabel != "":
		return fmt.Sprintf("node %q", node.NodeLabel)
	case node.NodeIP != "":
		return fmt.Sprintf("node %d (%s)", index+1, node.NodeIP)
	default:
		return fmt.Sprintf("node %d", index+1)
	}
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func quoteAll(values []string) []string {
	quoted := make([]string, len(values))
	for i, value := range values {
		quoted[i] = fmt.Sprintf("%q", value)
	}
	return quoted
}
