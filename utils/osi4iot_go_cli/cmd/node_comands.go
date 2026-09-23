package cmd

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/docker/docker/api/types/swarm"
	"github.com/spf13/cobra"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/snapshot"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// `osi4iot node` is the read-and-adjust half of node administration:
// see the machines, see what runs on them, take one out of rotation and
// put it back.
//
// Adding and removing nodes is deliberately NOT here. In osi4iot a node
// is an entry in the state file, an SSH target with the platform's key
// installed, and an input to where Patroni and NATS replicas are pinned. 
// Joining or removing one touches all of that, and removing one 
// has to answer questions this file does not ask
// — manager quorum, Patroni leaders, what happens to the node's
// volumes. Those get their own commands and their own guards.

var cmdNode = &cobra.Command{
	Use: "node",
	// "nodes" was the name of the placeholder this replaces, so it
	// keeps working. The singular is the primary spelling, to match
	// "service".
	Aliases: []string{"nodes"},
	Short:   "Nodes management",
	Long:    "Inspect the platform's machines and control which of them accept work",
}

var subCmdNodeList = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List the platform's nodes",
	Long: "Lists the swarm's nodes with the platform's view of each one beside it.\n\n" +
		"The two roles are not the same thing. SWARM is Docker's — manager or worker, and " +
		"which one holds the raft leadership. PLATFORM ROLE is the state file's: 'Manager' or " +
		"'Platform worker'.\n\n" +
		"LABELS shows every label on the node, the platform's first and yours after. The " +
		"platform's are the part nothing else shows: nodesConfiguration writes them from the " +
		"state file and they decide where replicas can run. nats_2 means this machine takes " +
		"the second NATS replica; admin-id=1 and metrics-id=1 pin the first Patroni replica of " +
		"each cluster. Long lists are cut in the table — 'osi4iot node inspect NODE' shows " +
		"them in full, split by which are managed and which are yours.",
	Args: cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		pd, dc := nodeContext()

		views, err := docker.ListNodeViews(pd, dc)
		if err != nil {
			exitWithError(err.Error())
			return
		}
		if len(views) == 0 {
			exitWithError("⚠️  No nodes found in the swarm")
			return
		}

		rows := make([]utils.NodeRow, len(views))
		for i, view := range views {
			rows[i] = nodeRowFor(view)
		}
		utils.NodesList(rows)

		reportQuorum(views)
	},
}

var nodeTasksAll bool

var subCmdNodeTasks = &cobra.Command{
	Use:   "ps NODE",
	Short: "List the tasks running on a node",
	Long: "Shows what is running on one node, newest first.\n\n" +
		"By default only the tasks the swarm intends to keep running. That includes ones " +
		"still preparing or starting, so a node does not look empty in the middle of a " +
		"deploy, and ones that are crash-looping, which is usually what someone is looking " +
		"for.\n\n" +
		"--all adds the finished ones — shutdown, failed, rejected. That is the other half of " +
		"the question: 'what happened on this machine' is normally answered by a task that " +
		"died ten minutes ago rather than by the ones that are fine.\n\n" +
		"NODE is a hostname, an address, a state file node label, or an id.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		pd, dc := nodeContext()

		view, err := docker.GetNodeView(pd, dc, args[0])
		if err != nil {
			exitWithError(err.Error())
			return
		}

		tasks, err := docker.ListNodeTasks(dc, view.Node.ID, nodeTasksAll)
		if err != nil {
			exitWithError(err.Error())
			return
		}
		if len(tasks) == 0 {
			if nodeTasksAll {
				fmt.Printf("No tasks on %s.\n", view.Hostname())
				return
			}
			fmt.Printf("Nothing running on %s. Use --all to include finished tasks.\n",
				view.Hostname())
			return
		}

		names := map[string]string{}
		if services, err := docker.ListSwarmServices(dc); err == nil {
			for _, service := range services {
				names[service.ID] = service.Spec.Name
			}
		}

		utils.NodeTasksList(view.Hostname(), tasks, names)
	},
}

var subCmdNodeInspect = &cobra.Command{
	Use:   "inspect NODE",
	Short: "Show everything known about a node",
	Long: "Detail for one node: what the swarm reports, what the state file says, the " +
		"machine's own resources, and its labels.\n\n" +
		"The labels are split into the ones the platform manages and the ones set by hand, " +
		"because they behave differently: nodesConfiguration rewrites platform_worker, " +
		"nats_*, admin-id and metrics-id from the state file on every init and " +
		"run, and anything else survives.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		pd, dc := nodeContext()

		view, err := docker.GetNodeView(pd, dc, args[0])
		if err != nil {
			exitWithError(err.Error())
			return
		}

		description := view.Node.Description
		report := utils.InspectNodeReport{
			NodeRow:      nodeRowFor(view),
			Engine:       description.Engine.EngineVersion,
			OS:           description.Platform.OS,
			Architecture: description.Platform.Architecture,
			CPUs:         description.Resources.NanoCPUs,
			MemoryBytes:  description.Resources.MemoryBytes,
			Labels:       view.Node.Spec.Labels,
			ManagedLabel: docker.IsPlatformManagedLabel,
			SSHUser:      view.Platform.NodeUserName,
		}
		utils.InspectNode(report)
	},
}

var (
	nodeDrainYes bool
)

var subCmdNodeDrain = &cobra.Command{
	Use:   "drain NODE",
	Short: "Stop a node accepting work and move its tasks away",
	Long: "Sets the node's availability to 'drain': the swarm stops scheduling on it and " +
		"reschedules what it is already running onto the other nodes. Use it before taking a " +
		"machine down for maintenance.\n\n" +
		"Undo it with 'osi4iot node activate'.\n\n" +
		"Draining is not free, and the command says so before doing it. Draining the node " +
		"holding a Patroni leader forces a failover. Draining the only node stops the platform.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		pd, dc := nodeContext()

		view, err := docker.GetNodeView(pd, dc, args[0])
		if err != nil {
			exitWithError(err.Error())
			return
		}
		if view.Availability() == string(swarm.NodeAvailabilityDrain) {
			fmt.Printf("%s is already drained.\n", view.Hostname())
			return
		}

		views, err := docker.ListNodeViews(pd, dc)
		if err != nil {
			exitWithError(err.Error())
			return
		}

		for _, warning := range drainWarnings(view, views) {
			fmt.Println(utils.StyleWarningMsg.Render(warning))
		}

		if !nodeDrainYes {
			answer, err := promptLine(fmt.Sprintf(
				"\nDrain %s and move its %d task(s) elsewhere? [y/N]: ",
				view.Hostname(), view.RunningTasks))
			if err != nil {
				exitWithError(err.Error())
				return
			}
			if !strings.EqualFold(answer, "y") && !strings.EqualFold(answer, "yes") {
				fmt.Println("Cancelled.")
				return
			}
		}

		if err := docker.SetNodeAvailability(dc, view, swarm.NodeAvailabilityDrain); err != nil {
			exitWithError(err.Error())
			return
		}

		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("%s is draining", view.Hostname())))
		fmt.Println("Rescheduling takes a moment. 'osi4iot node ps " + view.Hostname() +
			"' shows what is left running.")
	},
}

var subCmdNodeActivate = &cobra.Command{
	Use:   "activate NODE",
	Short: "Let a node accept work again",
	Long: "Sets the node's availability back to 'active', undoing a drain or a pause.\n\n" +
		"The swarm does not move tasks back on its own: services already rebalanced onto " +
		"other nodes stay there until something reschedules them. What this restores is the " +
		"node's eligibility, not its previous load.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		pd, dc := nodeContext()

		view, err := docker.GetNodeView(pd, dc, args[0])
		if err != nil {
			exitWithError(err.Error())
			return
		}
		if view.Availability() == string(swarm.NodeAvailabilityActive) {
			fmt.Printf("%s is already active.\n", view.Hostname())
			return
		}

		if err := docker.SetNodeAvailability(dc, view, swarm.NodeAvailabilityActive); err != nil {
			exitWithError(err.Error())
			return
		}
		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("%s is active", view.Hostname())))
	},
}

var (
	nodeLabelAdd []string
	nodeLabelRm  []string
)

var subCmdNodeUpdate = &cobra.Command{
	Use:   "update NODE",
	Short: "Add or remove labels on a node",
	Long: "Adds and removes swarm labels on one node.\n\n" +
		"IMPORTANT: labels set here are not permanent. nodesConfiguration rebuilds " +
		"platform_worker, nats_*, admin-id and metrics-id from the state file on " +
		"every 'init' and every 'run', so a label with one of those names lasts until the " +
		"next deployment and then goes back to whatever the state file implies. The command " +
		"refuses to touch them unless you pass --force.\n\n" +
		"Labels of your own, with any other name, survive.\n\n" +
		"  osi4iot node update node2 --label-add rack=B12\n" +
		"  osi4iot node update node2 --label-rm rack",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		pd, dc := nodeContext()

		force, _ := cmd.Flags().GetBool("force")

		if len(nodeLabelAdd) == 0 && len(nodeLabelRm) == 0 {
			exitWithError("nothing to do: pass --label-add or --label-rm")
			return
		}

		add := map[string]string{}
		for _, pair := range nodeLabelAdd {
			key, value, found := strings.Cut(pair, "=")
			if !found || key == "" {
				// The suggestion matters more than it looks. --label-add
				// is a StringSlice, so pflag splits on commas before this
				// sees the value, and a label whose VALUE contains one
				// arrives here as a fragment with no "=" in it. The
				// quoting that survives that split is pflag's CSV
				// quoting, which nobody guesses.
				exitWithError(fmt.Sprintf(
					"--label-add takes KEY=VALUE, and %q is not.\n"+
						"If the value contains a comma, quote it: "+
						"--label-add 'desc=\"planta baja,sala 3\"'",
					pair))
				return
			}
			add[key] = value
		}

		var managed []string
		for key := range add {
			if docker.IsPlatformManagedLabel(key) {
				managed = append(managed, key)
			}
		}
		for _, key := range nodeLabelRm {
			if docker.IsPlatformManagedLabel(key) {
				managed = append(managed, key)
			}
		}
		if len(managed) > 0 && !force {
			exitWithError(fmt.Sprintf(
				"%s %s managed by the platform: nodesConfiguration rewrites them from the "+
					"state file on the next init or run, so changing them here does not last. "+
					"Change the node's role in the state file instead, or pass --force if you "+
					"know it is temporary",
				strings.Join(managed, ", "), plural(len(managed), "is", "are")))
			return
		}

		view, err := docker.GetNodeView(pd, dc, args[0])
		if err != nil {
			exitWithError(err.Error())
			return
		}

		if err := docker.UpdateNodeLabels(dc, view, add, nodeLabelRm); err != nil {
			exitWithError(err.Error())
			return
		}

		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("Labels updated on %s", view.Hostname())))
		if len(managed) > 0 {
			fmt.Println(utils.StyleWarningMsg.Render(
				"These labels go back to what the state file implies on the next init or run."))
		}
	},
}

var (
	nodeAddIP       string
	nodeAddRole     string
	nodeAddUser     string
	nodeAddLabel    string
	nodeAddHostname string
	nodeAddYes      bool
)

var subCmdNodeAdd = &cobra.Command{
	Use:   "add",
	Short: "Join a machine to the platform",
	Long: "Adds a machine to the platform: records it in the state file, installs the " +
		"firewall rules and the volume plugin on it, joins it to the swarm " +
		"and gives it its placement labels.\n\n" +
		"The machine must be reachable over SSH as the user given, and the platform's public " +
		"key has to be installable on it — you are asked for the SSH password when the key is " +
		"not there yet.\n\n" +
		"The node is APPENDED to the list, never inserted. Placement labels are handed out in " +
		"list order, so appending is the only position that leaves the existing nodes with " +
		"the labels they already have.\n\n" +
		"Adding a node does not grow anything by itself. A new 'Platform worker' becomes " +
		"eligible to host a Patroni or NATS replica, but the number of replicas is its own " +
		"setting and does not change here.\n\n" +
		"  osi4iot node add --ip 192.168.1.14 --role \"Platform worker\" --user osi4iot",
	Args: cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		pd, _ := nodeContext()
		logger := log.New(os.Stdout, "", 0)

		if pd.PlatformInfo.DeploymentLocation == snapshot.LocationLocal {
			exitWithError("this is a local deployment: it has exactly one node, this machine. " +
				"Adding nodes means changing the deployment location, which is not something " +
				"this command can do")
			return
		}

		node := pt.NodeData{
			NodeIP:       strings.TrimSpace(nodeAddIP),
			NodeRole:     nodeAddRole,
			NodeUserName: strings.TrimSpace(nodeAddUser),
			NodeLabel:    strings.TrimSpace(nodeAddLabel),
			NodeHostName: strings.TrimSpace(nodeAddHostname),
		}

		candidate := snapshot.ExtractNodes(pd)
		candidate.Nodes = append(candidate.Nodes, snapshot.NodeOverlay{
			NodeLabel:    node.NodeLabel,
			NodeIP:       node.NodeIP,
			NodeRole:     node.NodeRole,
			NodeUserName: node.NodeUserName,
			NodeHostName: node.NodeHostName,
		})
		if err := candidate.Validate(); err != nil {
			exitWithError(err.Error())
			return
		}

		// Asked for rather than taken as a flag: a password on the
		// command line ends up in the shell history and in the process
		// list. Empty is fine and normal — it means the platform's key
		// is already on the machine.
		password, err := promptLine("SSH password for " + node.NodeUserName + "@" + node.NodeIP +
			" (empty if the platform's key is already installed): ")
		if err != nil {
			exitWithError(err.Error())
			return
		}
		node.NodePassword = strings.TrimSpace(password)

		fmt.Printf("\nAdding %s as '%s'.\n", node.NodeIP, node.NodeRole)
		if node.NodeRole == "Platform worker" {
			fmt.Println("It becomes eligible for Patroni and NATS replicas, but the number of")
			fmt.Println("replicas does not change: that is a separate setting.")
		}

		if !nodeAddYes {
			answer, err := promptLine("\nContinue? [y/N]: ")
			if err != nil {
				exitWithError(err.Error())
				return
			}
			if !strings.EqualFold(answer, "y") && !strings.EqualFold(answer, "yes") {
				fmt.Println("Cancelled.")
				return
			}
		}

		if err := docker.AddNodeToPlatform(pd, node, logger); err != nil {
			exitWithError(err.Error())
			return
		}

		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("%s is part of the platform", node.NodeIP)))
		fmt.Println("Run 'osi4iot run' to let the services use it.")
	},
}

var nodeRemoveYes bool

var subCmdNodeRemove = &cobra.Command{
	Use:     "remove NODE",
	Aliases: []string{"rm"},
	Short:   "Take a machine out of the platform",
	Long: "Drains the node, takes it out of the swarm, removes it from the state file and " +
		"reassigns the placement labels across the machines that are left.\n\n" +
		"Draining comes first so the swarm moves the containers rather than killing them.\n\n" +
		"The reassignment is the part to understand. Placement labels are handed out in list " +
		"order, so removing a 'Platform worker' renumbers every worker after it: the machine " +
		"that had admin-id=2 becomes admin-id=1, the patroni_admin1 service follows its label " +
		"onto a machine with no data for that replica, and Patroni rebuilds it from the " +
		"leader. Survivable, and slow.\n\n" +
		"What is not survivable is leaving fewer workers than there are replicas: the highest " +
		"admin-id would be on no machine at all and that service would sit unschedulable " +
		"forever, with nothing reporting it. The command refuses in that case and tells you " +
		"what to scale down first.\n\n" +
		"NODE is a hostname, an address, a state file node label, or an id.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		pd, dc := nodeContext()
		logger := log.New(os.Stdout, "", 0)

		view, err := docker.GetNodeView(pd, dc, args[0])
		if err != nil {
			exitWithError(err.Error())
			return
		}
		if !view.InStateFile {
			exitWithError(fmt.Sprintf(
				"%s is in the swarm but not in the platform's state file, so there is nothing "+
					"here to remove. Take it out with docker directly if that is what you want",
				view.Hostname()))
			return
		}
		if len(pd.PlatformInfo.NodesData) == 1 {
			exitWithError("this is the platform's only node: removing it would leave nothing " +
				"to run on. Use 'osi4iot delete' to take the platform down")
			return
		}

		impact := docker.PlanNodeRemoval(pd, view.Platform)

		if len(impact.HomelessServices) > 0 {
			exitWithError(fmt.Sprintf(
				"removing %s would leave %d worker(s) for services that need more: %s would "+
					"have no node to run on and would sit unschedulable.\n"+
					"Scale them down first, then remove the node",
				view.Hostname(), impact.WorkersAfter,
				strings.Join(impact.HomelessServices, ", ")))
			return
		}
		if impact.ManagersAfter == 0 && impact.ManagersBefore > 0 {
			exitWithError("removing this node would leave the swarm with no managers")
			return
		}

		fmt.Println()
		fmt.Print(docker.DescribeRemoval(impact, view.Platform))

		if view.RunningTasks > 0 {
			fmt.Printf("  %d task(s) are running on it and will be moved.\n", view.RunningTasks)
		}

		if !nodeRemoveYes {
			answer, err := promptLine("\nRemove it? [y/N]: ")
			if err != nil {
				exitWithError(err.Error())
				return
			}
			if !strings.EqualFold(answer, "y") && !strings.EqualFold(answer, "yes") {
				fmt.Println("Cancelled.")
				return
			}
		}

		if err := docker.RemoveNodeFromPlatform(pd, view, logger); err != nil {
			exitWithError(err.Error())
			return
		}

		fmt.Println(utils.StyleOKMsg.Render(
			fmt.Sprintf("%s is out of the platform", view.Hostname())))
		if len(impact.ShiftedWorkers) > 0 {
			fmt.Println("Placement labels have been reassigned. The replicas that moved are")
			fmt.Println("rebuilding from their leaders; 'osi4iot node ls' shows where they are now.")
		}
	},
}

// nodeContext is the two things every subcommand starts with.
func nodeContext() (*pt.PlatformData, *pt.DockerClient) {
	pd := data.GetData()
	dc, err := docker.GetManagerDC()
	if err != nil {
		exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
	}
	return pd, dc
}

// nodeRowFor flattens a NodeView for the renderer.
func nodeRowFor(view docker.NodeView) utils.NodeRow {
	return utils.NodeRow{
		ID:            view.Node.ID,
		Hostname:      view.Hostname(),
		Address:       view.Address(),
		SwarmRole:     view.SwarmRole(),
		IsLeader:      view.IsLeader,
		PlatformRole:  view.PlatformRole(),
		Availability:  view.Availability(),
		State:         view.State(),
		RunningTasks:  view.RunningTasks,
		PlacementTags: view.PlacementTags,
		OtherLabels:   view.OtherLabels(),
		InStateFile:   view.InStateFile,
	}
}

// reportQuorum says something about manager quorum when there is
// something to say.
//
// A swarm keeps working while a MAJORITY of its managers are
// reachable, and the failure is silent until the next manager goes:
// three managers with one down looks fine in a listing, and is one
// outage away from a swarm that cannot schedule anything.
func reportQuorum(views []docker.NodeView) {
	total, reachable := docker.CountManagers(views)
	if total == 0 {
		return
	}

	needed := total/2 + 1
	switch {
	case reachable < needed:
		fmt.Println(utils.StyleErrMsg.Render(fmt.Sprintf(
			"Quorum lost: %d of %d managers reachable, %d needed. "+
				"The swarm cannot schedule or update anything until one comes back.",
			reachable, total, needed)))
	case reachable == needed && total > 1:
		fmt.Println(utils.StyleWarningMsg.Render(fmt.Sprintf(
			"%d of %d managers reachable, %d needed: one more failure loses quorum.",
			reachable, total, needed)))
	case total%2 == 0:
		fmt.Println(utils.StyleWarningMsg.Render(fmt.Sprintf(
			"%d managers: an even number buys no extra tolerance over %d. Use 1, 3 or 5.",
			total, total-1)))
	}
}

// drainWarnings lists what draining this node costs.
func drainWarnings(view docker.NodeView, all []docker.NodeView) []string {
	var warnings []string

	if view.SwarmRole() == string(swarm.NodeRoleManager) {
		total, reachable := docker.CountManagers(all)
		needed := total/2 + 1
		warnings = append(warnings, fmt.Sprintf(
			"This node is a swarm manager. Draining stops it running tasks but it stays a "+
				"manager, so quorum is unaffected (%d of %d reachable, %d needed).",
			reachable, total, needed))
	}

	active := 0
	for _, candidate := range all {
		if candidate.Availability() == string(swarm.NodeAvailabilityActive) {
			active++
		}
	}
	if active <= 1 {
		warnings = append(warnings,
			"This is the only node accepting work. Draining it stops the whole platform.")
	}

	for _, tag := range view.PlacementTags {
		if strings.HasPrefix(tag, "admin-id") || strings.HasPrefix(tag, "metrics-id") {
			warnings = append(warnings, fmt.Sprintf(
				"This node carries %s, so a Patroni replica is pinned here. It cannot move to "+
					"another node, and if it is the leader the cluster will fail over.", tag))
		}
	}

	return warnings
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func init() {
	subCmdNodeTasks.Flags().BoolVarP(&nodeTasksAll, "all", "a", false,
		"Include finished tasks (shutdown, failed, rejected)")

	subCmdNodeDrain.Flags().BoolVarP(&nodeDrainYes, "yes", "y", false,
		"Do not ask for confirmation")

	subCmdNodeUpdate.Flags().StringSliceVar(&nodeLabelAdd, "label-add", nil,
		"Label to add, as KEY=VALUE (repeatable)")
	subCmdNodeUpdate.Flags().StringSliceVar(&nodeLabelRm, "label-rm", nil,
		"Label to remove, by key (repeatable)")
	subCmdNodeUpdate.Flags().Bool("force", false,
		"Allow changing labels the platform manages, knowing they will be rewritten")

	subCmdNodeAdd.Flags().StringVar(&nodeAddIP, "ip", "", "The machine's address (required)")
	subCmdNodeAdd.Flags().StringVar(&nodeAddRole, "role", "Platform worker", "Manager or Platform worker")
	subCmdNodeAdd.Flags().StringVar(&nodeAddUser, "user", "", "SSH user on the machine (required)")
	subCmdNodeAdd.Flags().StringVar(&nodeAddLabel, "label", "", "Name for the node in the state file")
	subCmdNodeAdd.Flags().StringVar(&nodeAddHostname, "hostname", "", "The machine's hostname")
	subCmdNodeAdd.Flags().BoolVarP(&nodeAddYes, "yes", "y", false, "Do not ask for confirmation")
	_ = subCmdNodeAdd.MarkFlagRequired("ip")
	_ = subCmdNodeAdd.MarkFlagRequired("user")

	subCmdNodeRemove.Flags().BoolVarP(&nodeRemoveYes, "yes", "y", false,
		"Do not ask for confirmation")

	cmdNode.AddCommand(subCmdNodeList)
	cmdNode.AddCommand(subCmdNodeTasks)
	cmdNode.AddCommand(subCmdNodeInspect)
	cmdNode.AddCommand(subCmdNodeDrain)
	cmdNode.AddCommand(subCmdNodeActivate)
	cmdNode.AddCommand(subCmdNodeUpdate)
	cmdNode.AddCommand(subCmdNodeAdd)
	cmdNode.AddCommand(subCmdNodeRemove)
	rootCmd.AddCommand(cmdNode)
}