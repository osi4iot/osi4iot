package cmd

import (
	"fmt"
	"os"
	"slices"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

var subCmdServiceState = &cobra.Command{
	Use:       "state [nats|patroni_admin|patroni_metrics|garage]...",
	Aliases:   []string{"health"},
	Short:     "Check whether NATS, Patroni or Garage is working properly",
	ValidArgs: docker.HealthCheckedServices,
	Long: "Checks, live, whether a stateful service is doing its job, and if not, why. " +
		"With no argument it checks all four.\n\n" +
		"For each instance it shows Swarm's view (task, node, health check) and the service's own, " +
		"read from inside its containers:\n" +
		"  nats             readiness, routes to the other servers, JetStream meta leader and peers, streams in sync\n" +
		"  patroni_admin    leader, replicas streaming and their lag, timeline, haproxy_patroni\n" +
		"  patroni_metrics  same as patroni_admin\n" +
		"  garage           cluster health and write quorum, nodes connected, layout role, free disk, resync errors\n\n" +
		"Verdicts:\n" +
		"  healthy   everything as it should be\n" +
		"  degraded  it works, with less redundancy than it should have: one more failure may take it down\n" +
		"  down      it does not do its job (no leader, no quorum, nothing answering)\n\n" +
		"Exit status: 0 all healthy, 2 something degraded, 1 something down.",
	Args: cobra.OnlyValidArgs,
	Run: func(cmd *cobra.Command, args []string) {
		services := args
		if len(services) == 0 {
			services = docker.HealthCheckedServices
		}
		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}

		worst := docker.HealthOK
		var seen []string
		for _, s := range services {
			if slices.Contains(seen, s) {
				continue
			}
			seen = append(seen, s)
			h := docker.CheckServiceHealth(pd, dc, s)
			fmt.Print(renderServiceHealth(h))
			if !h.NotUsed && h.Level > worst {
				worst = h.Level
			}
		}
		// os.Exit skips the normal clean-up; do it first, as
		// exitWithError does.
		switch worst {
		case docker.HealthDown:
			docker.CleanResources()
			os.Exit(1)
		case docker.HealthDegraded:
			docker.CleanResources()
			os.Exit(2)
		}
	},
}

// renderServiceHealth builds one service's report. Pure, for tests.
func renderServiceHealth(h docker.ServiceHealth) string {
	var b strings.Builder
	b.WriteString("\n")
	switch {
	case h.NotUsed:
		fmt.Fprintf(&b, "%s — not used\n", strings.ToUpper(h.Service))
	case h.Level == docker.HealthOK:
		fmt.Fprintf(&b, "%s — %s\n", strings.ToUpper(h.Service), utils.StyleOKMsg.Render("✅ healthy"))
	case h.Level == docker.HealthDegraded:
		fmt.Fprintf(&b, "%s — %s\n", strings.ToUpper(h.Service), utils.StyleWarningMsg.Render("⚠️  degraded"))
	default:
		fmt.Fprintf(&b, "%s — %s\n", strings.ToUpper(h.Service), utils.StyleErrMsg.Render("❌ down"))
	}

	if len(h.Rows) > 0 {
		b.WriteString("\n")
		w := tabwriter.NewWriter(&b, 0, 2, 3, ' ', 0)
		fmt.Fprintln(w, "  "+strings.Join(h.Header, "\t"))
		for _, r := range h.Rows {
			fmt.Fprintln(w, "  "+strings.Join(r, "\t"))
		}
		w.Flush()
	}
	if len(h.Problems) > 0 {
		b.WriteString("\n")
		for _, p := range h.Problems {
			fmt.Fprintf(&b, "  ✗ %s\n", p)
		}
	}
	if len(h.Notes) > 0 {
		b.WriteString("\n")
		for _, n := range h.Notes {
			fmt.Fprintf(&b, "  · %s\n", n)
		}
	}
	return b.String()
}
