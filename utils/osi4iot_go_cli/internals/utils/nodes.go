package utils

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"runtime"
	"strings"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/shirou/gopsutil/mem"
	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/lipgloss"
	"github.com/docker/docker/api/types/swarm"
)

func GetLocalNodeData() (types.NodeData, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return types.NodeData{}, err
	}

	usr, err := user.Current()
	if err != nil {
		return types.NodeData{}, err
	}

	cmd := exec.Command("uname", "-m")
	output, err := cmd.Output()
	if err != nil {
		return types.NodeData{}, err
	}
	nodeArch := strings.TrimSpace(string(output))

	localIP, err := GetLocalNodeIP()
	if err != nil {
		return types.NodeData{}, fmt.Errorf("error getting local node IP: %v", err)
	}

	nodeNanoCpus := int64(runtime.NumCPU() * 1e9)

	vm, err := mem.VirtualMemory()
	if err != nil {
		return types.NodeData{}, fmt.Errorf("error getting memory: %v", err)
	}

	nodeData := types.NodeData{
		NodeHostName:    hostname,
		NodeIP:          localIP,
		NodeUserName:    usr.Username,
		NodeRole:        "Manager",
		NodeArch:        nodeArch,
		NodeNanoCPUs:    nodeNanoCpus,
		NodeMemoryBytes: int64(vm.Total),
	}
	return nodeData, nil
}

// Rendering for `osi4iot node`. Same shape as ServicesList and
// InspectService so the output of the two command sets looks like it
// came from one program.

// NodeRow is what NodesList draws, flattened so this package does not
// have to know about the docker package's types.
//
// The dependency would be the wrong way round: internals/docker already
// imports this package, so a NodeView parameter here would be a cycle.
type NodeRow struct {
	ID            string
	Hostname      string
	Address       string
	SwarmRole     string
	IsLeader      bool
	PlatformRole  string
	Availability  string
	State         string
	RunningTasks  int
	PlacementTags []string
	OtherLabels   []string
	InStateFile   bool
}

// NodesList prints the swarm's nodes with the platform's view of them
// beside it.
//
// The two roles are shown separately on purpose: a machine that is a
// swarm worker can be the platform's NFS server, and the placement tags
// are what actually decide where a Patroni or NATS replica can land.
func NodesList(rows []NodeRow) {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("34")).
		Padding(1, 0)

	headerStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("42")).
		Padding(0, 1)

	cellStyle := lipgloss.NewStyle().Padding(0, 1)
	selectedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(""))

	footerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("241")).
		Italic(true).
		Padding(1, 0)

	fmt.Println(titleStyle.Render("🖥️  OSI4IOT platform nodes"))

	// The labels column is sized to its content rather than fixed: most
	// deployments have a handful of short ones and would waste half the
	// width, and a deployment with long ones would lose them to a
	// truncation that a wider column avoids entirely.
	labelsWidth := 20
	for _, row := range rows {
		if width := len(strings.Join(allLabels(row), " ")); width > labelsWidth {
			labelsWidth = width
		}
	}
	if labelsWidth > 46 {
		labelsWidth = 46
	}

	columns := []table.Column{
		{Title: "HOSTNAME", Width: 16},
		{Title: "ADDRESS", Width: 16},
		{Title: "SWARM", Width: 10},
		{Title: "PLATFORM ROLE", Width: 14},
		{Title: "AVAILABILITY", Width: 13},
		{Title: "STATE", Width: 8},
		{Title: "TASKS", Width: 6},
		{Title: "LABELS", Width: labelsWidth},
	}

	tableRows := make([]table.Row, 0, len(rows))
	for _, row := range rows {
		swarmRole := row.SwarmRole
		if row.IsLeader {
			swarmRole += " *"
		}

		platformRole := row.PlatformRole
		if !row.InStateFile {
			// A swarm node the state file does not describe is not a
			// cosmetic difference: nodesConfiguration will not label it,
			// so nothing the platform pins will ever run there.
			platformRole = "not in state file"
		}

		tableRows = append(tableRows, table.Row{
			truncate(row.Hostname, 16),
			truncate(row.Address, 16),
			swarmRole,
			truncate(platformRole, 14),
			row.Availability,
			row.State,
			fmt.Sprintf("%d", row.RunningTasks),
			truncate(strings.Join(allLabels(row), " "), labelsWidth),
		})
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithRows(tableRows),
		table.WithHeight(len(tableRows)+1),
		table.WithFocused(false),
	)

	s := table.DefaultStyles()
	s.Header = headerStyle
	s.Cell = cellStyle
	s.Selected = selectedStyle
	t.SetStyles(s)

	fmt.Println(lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")).
		Padding(1, 2).
		Render(t.View()))

	fmt.Println(footerStyle.Render(
		fmt.Sprintf("Total nodes: %d   (* = swarm leader)", len(rows))))
	fmt.Println(footerStyle.Render(
		"Labels: the platform's placement ones first, then your own. " +
			"'osi4iot node inspect NODE' shows them in full."))
}

// allLabels is what the LABELS column holds: the platform's placement
// labels first and the operator's after.
//
// The order is what makes the truncation tolerable. Placement decides
// where a Patroni or NATS replica can run and is the reason to read
// this column at all, so it goes where a cut cannot reach it.
func allLabels(row NodeRow) []string {
	labels := make([]string, 0, len(row.PlacementTags)+len(row.OtherLabels))
	labels = append(labels, row.PlacementTags...)
	return append(labels, row.OtherLabels...)
}

// NodeTasksList prints the tasks scheduled on one node.
func NodeTasksList(hostname string, tasks []swarm.Task, serviceNames map[string]string) {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("34")).
		Padding(1, 0)

	headerStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("42")).
		Padding(0, 1)

	cellStyle := lipgloss.NewStyle().Padding(0, 1)
	selectedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(""))

	footerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("241")).
		Italic(true).
		Padding(1, 0)

	fmt.Println(titleStyle.Render(fmt.Sprintf("🐳 Tasks on %s", hostname)))

	columns := []table.Column{
		{Title: "SERVICE", Width: 24},
		{Title: "SLOT", Width: 6},
		{Title: "DESIRED", Width: 10},
		{Title: "STATE", Width: 12},
		{Title: "UPDATED", Width: 14},
		{Title: "ERROR", Width: 34},
	}

	tableRows := make([]table.Row, 0, len(tasks))
	running := 0
	for _, task := range tasks {
		name := serviceNames[task.ServiceID]
		if name == "" {
			name = task.ServiceID
		}
		if task.Status.State == swarm.TaskStateRunning {
			running++
		}

		tableRows = append(tableRows, table.Row{
			truncate(name, 24),
			fmt.Sprintf("%d", task.Slot),
			string(task.DesiredState),
			string(task.Status.State),
			humanAge(task.UpdatedAt),
			truncate(task.Status.Err, 34),
		})
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithRows(tableRows),
		table.WithHeight(len(tableRows)+1),
		table.WithFocused(false),
	)

	s := table.DefaultStyles()
	s.Header = headerStyle
	s.Cell = cellStyle
	s.Selected = selectedStyle
	t.SetStyles(s)

	fmt.Println(lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")).
		Padding(1, 2).
		Render(t.View()))

	fmt.Println(footerStyle.Render(
		fmt.Sprintf("%d task(s), %d running", len(tasks), running)))
}

// InspectNodeReport is the detail view's input, flattened for the same
// reason as NodeRow.
type InspectNodeReport struct {
	NodeRow

	Engine       string
	OS           string
	Architecture string
	CPUs         int64
	MemoryBytes  int64
	Labels       map[string]string
	ManagedLabel func(string) bool

	SSHUser      string
	HasSSHAccess bool
}

// InspectNode prints everything known about one node.
func InspectNode(report InspectNodeReport) {
	titleStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("34"))
	labelStyle := lipgloss.NewStyle().Bold(true)
	noteStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("241")).Italic(true)

	fmt.Println()
	fmt.Println(titleStyle.Render("🖥️  " + report.Hostname))
	fmt.Println()

	line := func(label, value string) {
		if value == "" {
			return
		}
		fmt.Printf("  %s %s\n", labelStyle.Render(fmt.Sprintf("%-16s", label+":")), value)
	}

	line("ID", report.ID)
	line("Address", report.Address)

	swarmRole := report.SwarmRole
	if report.IsLeader {
		swarmRole += " (leader)"
	}
	line("Swarm role", swarmRole)
	line("Availability", report.Availability)
	line("State", report.State)
	line("Running tasks", fmt.Sprintf("%d", report.RunningTasks))

	fmt.Println()
	if report.InStateFile {
		line("Platform role", report.PlatformRole)
		line("SSH user", report.SSHUser)
	} else {
		fmt.Println("  " + noteStyle.Render(
			"This node is in the swarm but not in the platform state file."))
		fmt.Println("  " + noteStyle.Render(
			"It will not be labelled, so nothing the platform pins will run on it."))
	}

	fmt.Println()
	line("Engine", report.Engine)
	line("Platform", strings.TrimSpace(report.OS+" "+report.Architecture))
	if report.CPUs > 0 {
		line("CPUs", fmt.Sprintf("%d", report.CPUs/1e9))
	}
	if report.MemoryBytes > 0 {
		line("Memory", fmt.Sprintf("%.1f GiB", float64(report.MemoryBytes)/(1<<30)))
	}

	if len(report.Labels) == 0 {
		return
	}

	fmt.Println()
	fmt.Println("  " + labelStyle.Render("Labels:"))

	// Split rather than listed together, because the two kinds behave
	// differently: the platform's are rewritten from the state file on
	// every init and run, and anything else is the operator's and
	// survives.
	var managed, own []string
	for key, value := range report.Labels {
		entry := fmt.Sprintf("    %s = %s", key, value)
		if report.ManagedLabel != nil && report.ManagedLabel(key) {
			managed = append(managed, entry)
			continue
		}
		own = append(own, entry)
	}

	if len(managed) > 0 {
		fmt.Println("  " + noteStyle.Render("managed by the platform (rewritten on every init/run):"))
		for _, entry := range sortedStrings(managed) {
			fmt.Println(entry)
		}
	}
	if len(own) > 0 {
		fmt.Println("  " + noteStyle.Render("set by hand:"))
		for _, entry := range sortedStrings(own) {
			fmt.Println(entry)
		}
	}
	fmt.Println()
}

// humanAge renders a timestamp as an age, which is what a task table
// is read for.
func humanAge(at time.Time) string {
	if at.IsZero() {
		return ""
	}
	elapsed := time.Since(at)
	switch {
	case elapsed < time.Minute:
		return fmt.Sprintf("%ds ago", int(elapsed.Seconds()))
	case elapsed < time.Hour:
		return fmt.Sprintf("%dm ago", int(elapsed.Minutes()))
	case elapsed < 48*time.Hour:
		return fmt.Sprintf("%dh ago", int(elapsed.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(elapsed.Hours()/24))
	}
}

func truncate(value string, width int) string {
	if width <= 3 || len(value) <= width {
		return value
	}
	return value[:width-3] + "..."
}

func sortedStrings(values []string) []string {
	out := append([]string(nil), values...)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}