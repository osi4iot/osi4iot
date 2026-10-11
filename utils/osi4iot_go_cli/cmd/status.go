package cmd

import (
	"fmt"
	"sort"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// statusNode is one machine for `osi4iot status`: the swarm's view of it
// when a manager answered, the state file's otherwise.
type statusNode struct {
	Hostname     string
	Address      string
	Role         string // platform role (Manager, Platform worker…)
	State        string // swarm: ready, down… ("" if unknown)
	Availability string // swarm: active, drain, pause
}

// statusInput is everything the report is built from.
type statusInput struct {
	Info     pt.PlatformInfo
	State    data.PlatformStatus
	Reason   string
	Degraded []string
	Services []data.ServiceStatus
	Nodes    []statusNode
	NodesErr error
}

func runStatus() {
	pd := data.GetData()
	in := statusInput{
		Info:     pd.PlatformInfo,
		State:    data.GetPlatformState(),
		Reason:   data.PlatformStateReason,
		Degraded: data.PlatformStateDetail,
		Services: data.PlatformServices,
	}
	// The swarm is asked about its nodes only when it exists: without
	// one there is nothing to list, and the attempt only fails with
	// "This node is not a swarm manager".
	if data.PlatformSwarmActive {
		if dc, err := docker.GetManagerDC(); err == nil {
			views, err := docker.ListNodeViews(pd, dc)
			in.NodesErr = err
			for _, v := range views {
				in.Nodes = append(in.Nodes, statusNode{
					Hostname: v.Hostname(), Address: v.Address(), Role: v.PlatformRole(),
					State: v.State(), Availability: v.Availability(),
				})
			}
		}
	}
	if in.State == data.Unknown && len(in.Nodes) == 0 {
		// The swarm could not be asked: at least the machines the state
		// file knows, to help find the one that is down.
		for _, n := range pd.PlatformInfo.NodesData {
			in.Nodes = append(in.Nodes, statusNode{Hostname: n.NodeHostName, Address: n.NodeIP, Role: n.NodeRole})
		}
	}
	fmt.Print(renderStatus(in))
}

// renderStatus builds the report. Pure, for tests.
func renderStatus(in statusInput) string {
	var b strings.Builder
	line := func(label, value string) { fmt.Fprintf(&b, "  %-14s %s\n", label, value) }

	if in.State == data.Empty {
		b.WriteString("No platform is defined on this machine (no state file). " +
			"Create one with 'osi4iot create'.\n")
		return b.String()
	}

	pi := in.Info
	b.WriteString("\n")
	line("Platform", fmt.Sprintf("%s (%s)", pi.PlatformName, pi.DomainName))
	line("Deployment", strings.TrimSpace(pi.DeploymentLocation+", "+pi.DeploymentMode))

	stateText := in.State.String()
	switch in.State {
	case data.Running:
		stateText = utils.StyleOKMsg.Render(stateText)
	case data.Degraded, data.Unknown:
		stateText = utils.StyleWarningMsg.Render(stateText)
	}
	line("State", stateText)
	if in.State == data.Unknown && in.Reason != "" {
		line("", in.Reason)
	}

	// Deleted: no swarm, no services, no volumes. The state file still
	// describes the platform, but nothing of it exists to report on.
	if in.State == data.Deleted {
		line("", "Nothing of it is deployed. Initialize it with 'osi4iot init'.")
		b.WriteString("\n")
		return b.String()
	}

	if len(in.Services) > 0 {
		ok := 0
		for _, s := range in.Services {
			if s.Running >= s.Required {
				ok++
			}
		}
		line("Services", fmt.Sprintf("%d of %d with all their tasks running", ok, len(in.Services)))
		for _, d := range in.Degraded {
			line("", "  ✗ "+d)
		}
	}

	// Object store.
	switch {
	case utils.IsGarage(pi):
		perNode := map[string][]string{}
		for _, inst := range utils.GarageInstancesSorted(pi) {
			perNode[inst.NodeIP] = append(perNode[inst.NodeIP], utils.GarageInstanceServiceName(inst.ID))
		}
		line("Object store", fmt.Sprintf("Garage, %d instance(s), replication factor %d",
			len(pi.GarageInstances), utils.GarageReplicationFactor(pi)))
		ips := make([]string, 0, len(perNode))
		for ip := range perNode {
			ips = append(ips, ip)
		}
		sort.Strings(ips)
		for _, ip := range ips {
			line("", fmt.Sprintf("  %s: %s", ip, strings.Join(perNode[ip], ", ")))
		}
		if m := pi.GaragePendingMove; m != nil {
			line("", utils.StyleWarningMsg.Render(fmt.Sprintf("A Garage change was left half-way "+
				"(instance %d → %s). Resume it: osi4iot service rebalance garage", m.OldID, m.ToIP)))
		}
	case utils.IsAwsS3(pi):
		line("Object store", fmt.Sprintf("AWS S3, bucket %s (%s)", pi.S3BucketName, utils.S3Region(pi)))
	}

	if len(in.Nodes) > 0 {
		b.WriteString("\n  Nodes\n")
		fmt.Fprintf(&b, "    %-24s %-16s %-16s %-8s %s\n", "HOSTNAME", "ADDRESS", "ROLE", "STATE", "AVAILABILITY")
		for _, n := range in.Nodes {
			state, avail := n.State, n.Availability
			if state == "" {
				state, avail = "?", "?"
			}
			fmt.Fprintf(&b, "    %-24s %-16s %-16s %-8s %s\n", n.Hostname, n.Address, n.Role, state, avail)
		}
	}
	if in.NodesErr != nil {
		line("", fmt.Sprintf("(the swarm's nodes could not be listed: %v)", in.NodesErr))
	}
	b.WriteString("\n")
	return b.String()
}
