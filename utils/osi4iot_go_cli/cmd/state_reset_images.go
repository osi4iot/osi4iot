package cmd

import (
	"bufio"
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

// `osi4iot state reset_images` puts the packaged default images
// (utils.GetDefaultServicesDataMap) back into SERVICES_DATA. Only the
// image changes; replicas, CPU and memory are kept.
//
// Without --apply it is a local edit of the state file and works in
// any platform state. With --apply it then updates the running
// services to those images, and so needs the platform running: main.go
// builds the Docker clients for it (NeedsSwarmClients) like it does
// for the swarm actions.

var subCmdStateResetImages = &cobra.Command{
	Use:   "reset_images",
	Short: "Reset the service images in the state file to the defaults",
	Long: "Replace the image of every service in SERVICES_DATA of osi4iot_state.json with the default " +
		"image this CLI version ships. Replicas, CPU and memory are kept, and services without a " +
		"default image are left as they are.\n\n" +
		"Only the state file changes, unless --apply is given: then the running services are also " +
		"updated to those images, one at a time. --apply needs the platform running.",
	Example: "  osi4iot state reset_images --dry-run\n" +
		"  osi4iot state reset_images --service admin_api --service frontend\n" +
		"  osi4iot state reset_images --apply",
	Args: cobra.NoArgs,
	Run:  runStateResetImages,
}

func init() {
	subCmdStateResetImages.Flags().Bool("dry-run", false, "Only show the changes")
	subCmdStateResetImages.Flags().StringSlice("service", nil, "Only these services (repeatable)")
	subCmdStateResetImages.Flags().BoolP("yes", "y", false, "Do not ask for confirmation")
	subCmdStateResetImages.Flags().Bool("apply", false, "Also update the running services (platform must be running)")
	cmdState.AddCommand(subCmdStateResetImages)
}

// NeedsSwarmClients says whether the command line needs the Docker
// clients although its action is not one of SwarmActions.
func NeedsSwarmClients(args []string) bool {
	return len(args) >= 2 && args[0] == "state" && args[1] == "reset_images" &&
		slices.ContainsFunc(args[2:], func(a string) bool { return a == "--apply" || a == "--apply=true" })
}

func runStateResetImages(cmd *cobra.Command, _ []string) {
	if !utils.ExistStateFile() {
		exitWithError("No platform is defined here (there is no osi4iot_state.json in this directory).")
	}
	// The platform state is only worked out for swarm actions (and for
	// this one with --apply), so it says nothing here about the file:
	// an empty SERVICES_DATA is what a file that did not load leaves.
	if len(data.GetData().PlatformInfo.ServicesData) == 0 {
		exitWithError("The state file has no SERVICES_DATA (it could not be loaded, or the platform was never created).")
	}
	dryRun, _ := cmd.Flags().GetBool("dry-run")
	only, _ := cmd.Flags().GetStringSlice("service")
	yes, _ := cmd.Flags().GetBool("yes")
	apply, _ := cmd.Flags().GetBool("apply")

	// Checked before anything is written: --apply on a platform that is
	// not running would leave the state changed and nothing applied.
	if apply && !dryRun {
		switch data.GetPlatformState() {
		case data.Running, data.Degraded:
		default:
			exitWithWarning(fmt.Sprintf("--apply needs the platform running (its state is %s). "+
				"Run without --apply to change only the state file; the next 'osi4iot run' deploys those images.",
				data.GetPlatformState()))
		}
	}

	pd := data.GetData()
	plan := utils.PlanDefaultImages(pd.PlatformInfo.ServicesData, utils.GetDefaultServicesDataMap(pd), only)

	if len(plan.Unknown) > 0 {
		exitWithError(fmt.Sprintf("Unknown service(s) in SERVICES_DATA: %s", strings.Join(plan.Unknown, ", ")))
	}

	printImagesPlan(plan)

	if dryRun {
		return
	}

	if len(plan.Changes) > 0 {
		if !yes && !confirm("Write these images to the state file?") {
			fmt.Println("Nothing changed.")
			return
		}
		utils.ApplyDefaultImages(pd, plan)
		if err := utils.WritePlatformDataToFile(pd); err != nil {
			exitWithError(fmt.Sprintf("Error writing the state file: %v", err))
		}
		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("State file updated: %d service image(s) reset to the default.", len(plan.Changes))))
	} else {
		fmt.Println(utils.StyleOKMsg.Render("The state file already has the default images."))
	}

	if !apply {
		if len(plan.Changes) > 0 {
			fmt.Println(utils.StyleWarningMsg.Render("The running services were not changed. " +
				"Run again with --apply to update them, or they get these images on the next deployment."))
		}
		return
	}

	if len(plan.Changes) > 0 && !yes && !confirm("Update the running services now?") {
		fmt.Println("Running services not changed. Run 'osi4iot state reset_images --apply' to update them later.")
		return
	}

	dc, err := docker.GetManagerDC()
	if err != nil || dc == nil {
		exitWithError(fmt.Sprintf("Error getting the docker client of a manager node: %v", err))
	}

	fmt.Println()
	results := docker.ApplyStateImages(pd, dc, plan.Selected)
	printApplyResults(results)
}

func printImagesPlan(plan utils.DefaultImagesPlan) {
	if len(plan.Changes) == 0 {
		fmt.Println("Every selected service already has its default image.")
	} else {
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "SERVICE\tCURRENT IMAGE\t\tDEFAULT IMAGE")
		for _, c := range plan.Changes {
			current := c.Current
			if current == "" {
				current = "(none)"
			}
			fmt.Fprintf(w, "%s\t%s\t→\t%s\n", c.Service, current, c.Default)
		}
		w.Flush()
	}
	if len(plan.Unchanged) > 0 {
		fmt.Printf("\nAlready default: %s\n", strings.Join(plan.Unchanged, ", "))
	}
	if len(plan.NoDefault) > 0 {
		fmt.Printf("No default image (left as they are): %s\n", strings.Join(plan.NoDefault, ", "))
	}
	fmt.Println()
}

func printApplyResults(results []docker.ImageApplyResult) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "\nSERVICE\tIMAGE\tRESULT")
	failed := 0
	warnings := ""
	for _, r := range results {
		name := r.Service
		if name == "" {
			name = r.Entry
		}
		status := r.Status
		if r.Err != nil {
			status = fmt.Sprintf("failed: %v", r.Err)
			failed++
		}
		fmt.Fprintf(w, "%s\t%s\t%s\n", name, r.Image, status)
		warnings += r.Warnings
	}
	w.Flush()
	fmt.Println()

	if warnings != "" {
		fmt.Println(utils.StyleWarningMsg.Render("Warnings:\n" + warnings))
	}
	if failed > 0 {
		exitWithError(fmt.Sprintf("%d service(s) could not be updated. The state file already has the default "+
			"images: fix the cause and run 'osi4iot state reset_images --apply' again — it only updates what "+
			"is still behind.", failed))
	}
	fmt.Println(utils.StyleOKMsg.Render("Running services are on the images of the state file."))
}

func confirm(question string) bool {
	fmt.Printf("%s (y/n): ", question)
	reader := bufio.NewReader(os.Stdin)
	answer, _ := reader.ReadString('\n')
	answer = strings.ToLower(strings.TrimSpace(answer))
	return answer == "y" || answer == "yes"
}
