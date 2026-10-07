package cmd

import (
	"fmt"
	"log"
	"os"
	"regexp"
	"runtime/debug"
	"slices"
	"strconv"
	"strings"
	"text/tabwriter"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/ui/form"
	"github.com/spf13/cobra"
)

var version = "dev"

// SetVersion records the CLI's version. Called by main before any command
// runs, with the contents of the embedded VERSION file.
func SetVersion(v string) {
	if v != "" {
		version = v
	}
}

// SwarmActions lists the actions that need pt.DCMap populated before
// they run (see main.go).
//
// "state" is deliberately NOT here. Its two subcommands are the ones
// that have to work when the platform does not: `export` only reads the
// local file, and `recover` builds its own connections (see
// docker.OpenSSHRecoveryTarget) rather than using DCMap. Listing it
// would make main.go require a reachable manager first — via
// CheckDockerClientsMap, which exits when it finds none — and fail
// exactly the case recovery exists for. The state file's S3 backups run
// under "backup", which is here.
var SwarmActions = []string{"create", "init", "run", "stop", "delete", "service", "certs", "streams", "node", "backup", "status", "custom_service"}

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "osi4iot",
	Short: "osi4iot is a CLI tool for OSI4IOT",
	Long:  `osi4iot is a CLI tool for OSI4IOT`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		noEncrypt, _ := cmd.Flags().GetBool("no-encrypt")
		crypto.SetNoEncrypt(noEncrypt)
		// Commands that need the platform deployed say so plainly when it
		// is not, instead of failing on whatever Docker answers.
		requirePlatformFor(cmd)
	},
	// Run: func(cmd *cobra.Command, args []string) {},
}

var cmdVersion = &cobra.Command{
	Use:   "version",
	Short: "Show osi4iot version",
	Long:  "Show osi4iot version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("osi4iot CLI version: %s\n", versionString())
	},
}

// versionString is the stamped version plus, when the binary carries
// it, the git commit it was built from — "-dirty" when that commit had
// uncommitted changes. Go records both on its own when building inside
// a git checkout.
func versionString() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return version
	}
	var revision, dirty string
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			revision = s.Value
		case "vcs.modified":
			if s.Value == "true" {
				dirty = "-dirty"
			}
		}
	}
	if revision == "" {
		return version
	}
	if len(revision) > 7 {
		revision = revision[:7]
	}
	return fmt.Sprintf("%s (%s%s)", version, revision, dirty)
}

var cmdCreate = &cobra.Command{
	Use:   "create",
	Short: "Create a new platform and start it",
	Long:  "Create a new platform and start it",
	Run: func(cmd *cobra.Command, args []string) {
		checkState("create")
		form.CreatePlatform()
		platformState := data.GetPlatformState()
		if platformState == data.Initiating {
			pd := data.GetData()
			_, err := docker.SetDockerClientsMap(pd, "create")
			if err != nil {
				errMsg := fmt.Sprintf("Error setting Docker clients map: %v", err)
				exitWithError(errMsg)
			}
			defer func() {
				docker.CleanResources()
			}()

			if err := docker.ResetBucketForNewPlatform(pd, log.New(os.Stdout, "", 0)); err != nil {
				exitWithError(err.Error())
			}

			err = docker.InitPlatform(pd)
			if err != nil {
				errMsg := fmt.Sprintf("Error initializing platform: %v", err)
				exitWithError(errMsg)
			}

			dc, err := docker.GetManagerDC()
			if err == nil {
				docker.TakeInitialBackups(pd, dc, log.New(os.Stdout, "", 0))
			}
			okMessage := "Platform has been created successfully and is ready to be used"
			err = docker.SwarmInitiationInfo(pd, okMessage)
			if err != nil {
				errMsg := fmt.Sprintf("Error: initializing the platform %v", err)
				exitWithError(errMsg)
			}
		}
	},
}

var cmdInit = &cobra.Command{
	Use:   "init",
	Short: "Init a new osi4iot platform using the existing configuration",
	Long:  "Init a new osi4iot platform using the existing configuration",
	Run: func(cmd *cobra.Command, args []string) {
		checkState("init")
		pd := data.GetData()

		snapshotPath, _ := cmd.Flags().GetString(snapshotFileFlag)
		fromBucket, _ := cmd.Flags().GetString(fromBucketFlag)

		// A new, empty platform from an old state file, with every
		// generated secret replaced — see init_reset.go. main.go has
		// already rejected it next to a restore; checked again here so
		// this command is correct on its own.
		if resetPasswords, _ := cmd.Flags().GetBool(resetPasswordsFlag); resetPasswords {
			if snapshotPath != "" || fromBucket != "" {
				exitWithError(fmt.Sprintf("--%s cannot be combined with --%s or --%s",
					resetPasswordsFlag, snapshotFileFlag, fromBucketFlag))
			}
			assumeYes, _ := cmd.Flags().GetBool(assumeYesFlag)
			if err := resetPlatformSecrets(pd, assumeYes); err != nil {
				exitWithError(fmt.Sprintf("Error resetting the platform secrets: %v", err))
			}
		}

		// Three modes, differing in exactly two places: which services
		// the first deployment leaves out, and what happens once it is
		// up. Both restoring modes hold admin_api, grafana and
		// pipelines back, because they read the database once at
		// startup and the database is about to be replaced.
		var deferred []string
		if snapshotPath != "" || fromBucket != "" {
			deferred = docker.DeferredUntilRestored
		}

		if err := docker.InitPlatform(pd, deferred...); err != nil {
			exitWithError(fmt.Sprintf("Error starting platform: %v", err))
		}

		okMessage := "Platform has been initialized successfully and is ready to be used"

		switch {
		case snapshotPath != "":
			persistNodeData(pd)
			if err := finishInitFromSnapshot(pd, snapshotPath); err != nil {
				exitWithError(fmt.Sprintf("Error restoring from the snapshot: %v", err))
			}
			okMessage = "Platform has been initialized from the snapshot and is ready to be used"

		case fromBucket != "":
			persistNodeData(pd)
			if err := finishInitFromBucket(pd); err != nil {
				exitWithError(fmt.Sprintf("Error restoring from the bucket: %v", err))
			}
			okMessage = "Platform has been restored from its bucket and is ready to be used"

		default:
			// Only here: a platform restored from a backup already has
			// a catalogue, and a base backup of the empty clusters this
			// init created would be noise in it.
			dc, err := docker.GetManagerDC()
			if err != nil {
				fmt.Println(utils.StyleWarningMsg.Render(fmt.Sprintf(
					"Could not take the first backups: %v", err)))
			} else {
				docker.TakeInitialBackups(pd, dc, log.New(os.Stdout, "", 0))
			}
		}

		if err := docker.SwarmInitiationInfo(pd, okMessage); err != nil {
			exitWithError(fmt.Sprintf("Error: initializing the platform %v", err))
		}
	},
}

// persistNodeData saves the state file before the long part of a
// restore.
//
// InitPlatform has just discovered this swarm's node ids, architecture
// and resources, and SwarmInitiationInfo — which normally persists them
// — does not run until the restore has finished. A failure in between
// would throw that away, and the retry would have to rediscover it.
func persistNodeData(pd *pt.PlatformData) {
	if err := utils.WritePlatformDataToFile(pd); err != nil {
		exitWithError(fmt.Sprintf("Error saving platform data: %v", err))
	}
}

var cmdRun = &cobra.Command{
	Use:   "run",
	Short: "Start osi4iot platform",
	Long:  "Start osi4iot platform",
	Run: func(cmd *cobra.Command, args []string) {
		checkState("run")
		pd := data.GetData()
		excludedServices, _ := cmd.Flags().GetStringSlice("exclude")
		pd.PlatformInfo.ExcludedServices = excludedServices
		dc, err := docker.GetManagerDC()
		if err != nil {
			errMsg := fmt.Sprintf("Error: getting docker client %v", err)
			exitWithError(errMsg)
		}
		err = docker.RunSwarm(dc, pd)
		if err != nil {
			errMsg := fmt.Sprintf("Error: runing the platform %v", err)
			exitWithError(errMsg)
		} else {
			pd := data.GetData()
			okMessage := "Platform has been started successfully and is ready to to be used"
			err = docker.SwarmInitiationInfo(pd, okMessage)
			if err != nil {
				errMsg := fmt.Sprintf("Error: initializing the platform %v", err)
				exitWithError(errMsg)
			}
		}
	},
}

var cmdStop = &cobra.Command{
	Use:   "stop",
	Short: "Stop platform",
	Long:  "Stop platform",
	Run: func(cmd *cobra.Command, args []string) {
		checkState("stop")
		pd := data.GetData()
		err := docker.StopPlatform(pd)
		if err != nil {
			errMsg := fmt.Sprintf("Error: stopping the platform %v", err)
			exitWithError(errMsg)
		} else {
			okMsg := utils.StyleOKMsg.Render("Platform has been stopped successfully")
			fmt.Println(okMsg)
		}
	},
}

var cmdDelete = &cobra.Command{
	Use:   "delete",
	Short: "Delete platform",
	Long: "Removes the platform from the swarm: services, secrets, configs, networks, " +
		"containers, volumes and the nodes' swarm membership.\n\n" +
		"The S3 bucket is NOT touched. With an external bucket that is what makes a deleted " +
		"platform recoverable: the state file backups, both wal-g catalogues, the NATS runs " +
		"and org_data are all still there afterwards, and 'osi4iot init --from-bucket' can " +
		"bring the whole thing back from them.\n\n" +
		"--remove-bucket empties and deletes the bucket as well. That is irreversible and " +
		"there is nothing left to recover from, so it is opt-in and confirmed.\n\n" +
		"With an external bucket that is kept, the platform is backed up one last time " +
		"before anything is removed — both Patroni clusters, the NATS streams and the state " +
		"file — so the bucket holds it as it is at the moment of the delete rather than as " +
		"of the last scheduled backups (up to archive_timeout behind for Postgres, up to a " +
		"day for NATS). If one of them fails, or system_manager is not running to take " +
		"them, the delete asks before going on. --no-final-backups skips them.\n\n" +
		"With a local Garage there is nothing extra to remove: that bucket lives in the " +
		"garage volumes and goes with them either way.",
	Run: func(cmd *cobra.Command, args []string) {
		checkState("delete")
		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			errMsg := fmt.Sprintf("Error getting docker client: %v", err)
			exitWithError(errMsg)
		}

		removeBucket, _ := cmd.Flags().GetBool("remove-bucket")
		if removeBucket {
			logger := log.New(os.Stdout, "", 0)
			if count, err := docker.CountBucketObjects(pd, dc); err == nil && count > 0 {
				fmt.Println(utils.StyleWarningMsg.Render(fmt.Sprintf(
					"s3://%s holds %d object(s): every backup this platform has, and after this "+
						"there is nothing left to restore from.",
					pd.PlatformInfo.S3BucketName, count)))
				answer, err := promptLine("Type the bucket name to confirm: ")
				if err != nil || strings.TrimSpace(answer) != pd.PlatformInfo.S3BucketName {
					exitWithError("Cancelled.")
				}
			}
			if err := docker.RemovePlatformBucket(pd, dc, logger); err != nil {
				exitWithError(err.Error())
			}
		}

		// An external bucket that is kept is what the platform will be
		// rebuilt from (init --from-bucket): bring it up to date first.
		noFinalBackups, _ := cmd.Flags().GetBool("no-final-backups")
		if utils.IsAwsS3(pd.PlatformInfo) && !removeBucket && !noFinalBackups {
			takeFinalBackupsBeforeDelete(pd, dc)
		}

		err = docker.DeletePlatform(pd)
		if err != nil {
			errMsg := fmt.Sprintf("Error: deleting the platform %v", err)
			exitWithError(errMsg)
		} else {
			okMsg := utils.StyleOKMsg.Render("Platform has been deleted successfully")
			fmt.Println(okMsg)
		}
		crypto.ClearPassphrase()
	},
}

var cmdService = &cobra.Command{
	Use:   "service",
	Short: "Services management",
	Long:  "Services management",
}

var subCmdServiceList = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List services",
	Long:    "List services",
	Run: func(cmd *cobra.Command, args []string) {
		dc, err := docker.GetManagerDC()
		if err != nil {
			errMsg := fmt.Sprintf("Error getting docker client: %v", err)
			exitWithError(errMsg)
		}

		services, err := docker.ListSwarmServices(dc)
		if err != nil {
			errMsg := fmt.Sprintf("Error listing services: %v", err)
			exitWithError(errMsg)
		}

		if len(services) == 0 {
			errMsg := "⚠️  No services found in the swarm"
			exitWithError(errMsg)
		}

		utils.ServicesList(services)
	},
}

var subCmdServiceInspect = &cobra.Command{
	Use:   "inspect SERVICE",
	Short: "Inspect a specific service",
	Long:  "Display detailed information about a specific service",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		serviceName := args[0]

		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			errMsg := fmt.Sprintf("Error getting docker client: %v", err)
			exitWithError(errMsg)
		}

		service, err := utils.GetSwarmServiceByName(dc, serviceName)
		if err != nil {
			errMsg := fmt.Sprintf("Error inspecting service: %v", err)
			exitWithError(errMsg)
		}

		networks, err := docker.GetServiceNetworks(dc, service)
		if err != nil {
			errMsg := fmt.Sprintf("Error listing networks: %v", err)
			exitWithError(errMsg)
		}

		utils.InspectService(pd, service, networks)
	},
}

var subCmdServiceScale = &cobra.Command{
	Use:   "scale SERVICE=REPLICAS.",
	Short: "Scale services",
	Long:  "Scale services to the desired number of replicas",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		svcPairStr := args[0]

		pd := data.GetData()

		svcPair := strings.TrimSpace(svcPairStr)
		dc, err := docker.GetManagerDC()
		if err != nil {
			errMsg := fmt.Sprintf("Error getting docker client: %v", err)
			exitWithError(errMsg)
		}

		parts := strings.SplitN(svcPair, "=", 2)
		if len(parts) != 2 {
			errMsg := fmt.Sprintf("Invalid service-replicas pair: %s", svcPair)
			exitWithError(errMsg)
		}
		serviceName := parts[0]
		replicasStr := parts[1]

		scalableServices := utils.GetScalableServices(pd)
		if !slices.Contains(scalableServices, serviceName) {
			errMsg := fmt.Sprintf("Service '%s' is not scalable", serviceName)
			exitWithError(errMsg)
		}

		replicas, err := strconv.ParseUint(replicasStr, 10, 64)
		if err != nil {
			errMsg := fmt.Sprintf("Error parsing replicas argument: %v", err)
			exitWithError(errMsg)
		}

		warnings, err := docker.ScaleSwarmService(pd, dc, serviceName, replicas)
		if err != nil {
			errMsg := fmt.Sprintf("Error scaling service: %v", err)
			exitWithError(errMsg)
		}

		if warnings != "" {
			warningMsg := utils.StyleWarningMsg.Render("Warnings:\n" + warnings)
			fmt.Println(warningMsg)
		}

		fmt.Println()
		if warnings == "" {
			okMsg := utils.StyleOKMsg.Render(fmt.Sprintf("Service '%s' has been scaled to %d replicas successfully", serviceName, replicas))
			fmt.Println(okMsg)
		}
	},
}

var subCmdServiceRebalance = &cobra.Command{
	Use:   "rebalance SERVICE",
	Short: "Spread a service's instances evenly over the nodes (garage)",
	Long: "Moves Garage instances so they are spread evenly over the platform workers: " +
		"1 worker holds 3; 2 workers, 2 and 1; 3 or more, one each.\n\n" +
		"Each move creates a new instance on the target node, changes Garage's layout, waits " +
		"until the data has been copied to it, and only then removes the old instance — one " +
		"move at a time, so the object store keeps working throughout.\n\n" +
		"It also resumes a change that was interrupted (Ctrl-C, a lost connection), from " +
		"where it stopped. 'osi4iot node add' runs it on its own for a new worker; run it " +
		"by hand after 'node add --no-rebalance'.\n\n" +
		"Not needed after 'node drain' + 'node activate': instances are pinned to their " +
		"nodes and come back with their data.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if args[0] != utils.GarageServiceName {
			exitWithError(fmt.Sprintf("only '%s' can be rebalanced", utils.GarageServiceName))
		}
		pd := data.GetData()
		if !utils.IsGarage(pd.PlatformInfo) {
			exitWithError("this platform does not run Garage")
		}
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}
		if err := docker.RebalanceGarage(pd, dc, log.New(os.Stdout, "", 0)); err != nil {
			exitWithError(fmt.Sprintf("Error rebalancing Garage: %v\n"+
				"Run the same command again to resume.", err))
		}
		utils.SyncGarageServiceData(pd)
		if err := utils.WritePlatformDataToFile(pd); err != nil {
			exitWithError(fmt.Sprintf("Error saving the state file: %v", err))
		}
		fmt.Println(utils.StyleOKMsg.Render("Garage is evenly spread over the nodes"))
	},
}

var subCmdServiceUpdateResources = &cobra.Command{
	Use:   "resources SERVICE=CPU-MEM",
	Short: "Manage resource limits for a service",
	Long: `Set CPU and memory limits for a Docker Swarm service.

The resource specification must follow this format:

  SERVICE=CPU-MEM

Where:
  SERVICE  is the service name
  CPU      is expressed in cores (e.g. 0.50)
  MEM      is expressed in megabytes (e.g. 1000Mb)

Example:
  osi4iot service resources admin_api=0.50CPU-1000Mb
`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		svcPairStr := args[0]

		re := regexp.MustCompile(`(?i)^([^=]+)=([0-9.]+)CPU-([0-9]+)MB$`)
		matches := re.FindStringSubmatch(svcPairStr)
		if matches == nil {
			erroMsg := fmt.Sprintf("invalid format %q\nexpected: SERVICE=CPU-MEM (e.g. admin_api=0.50CPU-1000Mb)", svcPairStr)
			exitWithError(erroMsg)
		}

		serviceName := matches[1]
		cpu, err := strconv.ParseFloat(matches[2], 64)
		if err != nil {
			errMsg := fmt.Sprintf("Error parsing CPU value: %v", err)
			exitWithError(errMsg)
		}

		mem, err := strconv.ParseInt(matches[3], 10, 64)
		if err != nil {
			errMsg := fmt.Sprintf("Error parsing memory value: %v", err)
			exitWithError(errMsg)
		}

		dc, err := docker.GetManagerDC()
		if err != nil {
			errMsg := fmt.Sprintf("Error getting docker client: %v", err)
			exitWithError(errMsg)
		}

		pd := data.GetData()
		warnings, err := docker.UpdateSwarmServiceResources(pd, dc, serviceName, mem, cpu)
		if err != nil {
			errMsg := fmt.Sprintf("Error updating service resources: %v", err)
			exitWithError(errMsg)
		}

		if warnings != "" {
			warningMsg := utils.StyleWarningMsg.Render("Warnings:\n" + warnings)
			fmt.Println(warningMsg)
		}

		fmt.Println()
		if warnings == "" {
			okMsg := utils.StyleOKMsg.Render(fmt.Sprintf("Service '%s' resources have been updated successfully", serviceName))
			fmt.Println(okMsg)
		}
	},
}

var subCmdServiceUpdateImage = &cobra.Command{
	Use:   "image SERVICE=IMAGE",
	Short: "Manage service images",
	Long:  "Manage service images",
	Run: func(cmd *cobra.Command, args []string) {
		svcPairStr := args[0]

		svcPair := strings.TrimSpace(svcPairStr)
		dc, err := docker.GetManagerDC()
		if err != nil {
			errMsg := fmt.Sprintf("Error getting docker client: %v", err)
			exitWithError(errMsg)
		}

		parts := strings.SplitN(svcPair, "=", 2)
		if len(parts) != 2 {
			errMsg := fmt.Sprintf("Invalid service-replicas pair: %s", svcPair)
			exitWithError(errMsg)
		}
		serviceName := parts[0]
		image := parts[1]

		pd := data.GetData()
		warnings, err := docker.UpdateSwarmServiceImage(pd, dc, serviceName, image)
		if err != nil {
			errMsg := fmt.Sprintf("Error updating service image: %v", err)
			exitWithError(errMsg)
		}

		if warnings != "" {
			warningMsg := utils.StyleWarningMsg.Render("Warnings:\n" + warnings)
			fmt.Println(warningMsg)
		}

		fmt.Println()
		if warnings == "" {
			okMsg := utils.StyleOKMsg.Render(fmt.Sprintf("Service '%s' image has been updated successfully", serviceName))
			fmt.Println(okMsg)
		}
	},
}

var subCmdCertsCheck = &cobra.Command{
	Use:   "check",
	Short: "Check certificates expiration",
	Long:  "Check certificates expiration",
	Run: func(cmd *cobra.Command, args []string) {
		pd := data.GetData()

		// The state file's copy goes stale as soon as system_manager
		// renews, so check against the real one before reporting.
		// Best-effort: on a platform that has never deployed
		// system_manager there is nothing to read, and a failure here
		// shouldn't stop a read-only command from answering.
		if dc, dcErr := docker.GetManagerDC(); dcErr == nil {
			if updated, source, err := docker.SyncCertsFromSystemManager(pd, dc); err != nil {
				fmt.Printf("Warning: could not check against system_manager (%v)\n", err)
			} else if updated {
				fmt.Printf("Picked up newer certificates from %s.\n", source)
				if err := utils.WritePlatformDataToFile(pd); err != nil {
					fmt.Printf("Warning: could not save the updated certificates: %v\n", err)
				}
			}
		}

		expirationInfo, err := utils.GetCertsExpirationInfo(pd)
		if err != nil {
			errMsg := fmt.Sprintf("Error checking certificates: %v", err)
			exitWithError(errMsg)
		}
		fmt.Println("Platform certificates expiration info:")
		fmt.Printf("Expiration date: %s\n", expirationInfo.ExpirationTime)
		fmt.Printf("Time to expiry: %d days\n", expirationInfo.DaysToExpiry)
	},
}

var subCmdCertsUpdate = &cobra.Command{
	Use:   "update",
	Short: "Renew the domain certificates",
	Long: "Renew the platform's Let's Encrypt certificates. Delegates to system_manager " +
		"when the platform is running, and falls back to renewing locally when it is not.",
	Run: func(cmd *cobra.Command, args []string) {
		stdoutLogger := log.New(os.Stdout, "", 0)
		if err := runCertsUpdate(stdoutLogger); err != nil {
			exitWithError(err.Error())
		}
	},
}

var subCmdCertsDownload = &cobra.Command{
	Use:     "download",
	Aliases: []string{"pull"},
	Short:   "Download the certificates stored by system_manager",
	Long: "Fetch the certificate material system_manager keeps in its volume and store it " +
		"in the local state file. system_manager renews on its own schedule, so the local " +
		"copy goes stale on its own; this brings it back in sync. Works with the platform " +
		"stopped too — it then reads the volume directly instead of going through NATS.",
	Run: func(cmd *cobra.Command, args []string) {
		stdoutLogger := log.New(os.Stdout, "", 0)
		if err := runCertsDownload(stdoutLogger); err != nil {
			exitWithError(err.Error())
		}
	},
}

var cmdCustomService = &cobra.Command{
	Use:   "custom_service",
	Short: "Custom services management",
	Long:  "Custom services management",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Custom services management")
	},
}

var subCmdListCS = &cobra.Command{
	Use:   "list",
	Short: "List custom services",
	Long:  "List custom services",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("List ocustom services")
	},
}

var subCmdUpdateCS = &cobra.Command{
	Use:   "update",
	Short: "Update custom service",
	Long:  "Update custom service",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Update custom services")
	},
}

var subCmdAddCS = &cobra.Command{
	Use:   "add",
	Short: "Add custom service",
	Long:  "Add custom service",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Add ustom service")
	},
}

var subCmdRemoveCS = &cobra.Command{
	Use:   "remove",
	Short: "Remove custom service",
	Long:  "Remove custom service",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Remove custom service")
	},
}

var (
	stateRecoverFile      string
	stateRecoverFromGar   bool
	stateRecoverGarageImg string
	stateRecoverBucket    string
	stateRecoverRegion    string
	stateRecoverKeyPfx    string
)

var subCmdStateRecover = &cobra.Command{
	Use:   "recover",
	Short: "Rebuild the local state file without going through the platform",
	Long: "Recover osi4iot_state.json when the platform cannot hand it back — because it is " +
		"stopped, or because the state file itself is gone or unreadable. Decrypts a stored " +
		"backup and writes it out under this machine's passphrase; the file being replaced, " +
		"if any, is kept alongside it with a .bak-<timestamp> suffix.\n\n" +
		"--file installs a backup you downloaded yourself, from the AWS console or " +
		"with any S3 client (aws, rclone…). It needs nothing but the passphrase: no platform, no network, " +
		"no existing state file.\n\n" +
		"--from-garage covers a Garage deployment whose platform is stopped, where there is " +
		"nothing to download from. It starts a temporary Garage, with no network, against the " +
		"garage_meta and garage_data volumes, reads the backup out through docker exec and " +
		"takes it down again, over SSH if the volumes are on another node. It needs no " +
		"credentials besides the state file's passphrase.\n\n" +
		"--from-bucket NAME reads the backups straight out of an external S3 bucket, which is " +
		"the case in between: 'osi4iot delete' never touches S3, so a bucket outlives its " +
		"platform and the backups are reachable but nobody wants to hunt for the right object " +
		"by hand. It asks for the bucket's credentials, because there is no state file to take " +
		"them from yet — that is the point. AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are " +
		"used when both are set, so it stays scriptable; otherwise they are prompted for and " +
		"the secret key is not echoed. Nothing is stored. The recent backups are listed with " +
		"their dates so you can take an older one, which is what you want when recovering from " +
		"a change rather than from a loss.\n\n" +
		"To restore from S3 with the platform running, use 'osi4iot backup restore state'. To " +
		"rebuild the whole platform from a bucket and not just the state file, use " +
		"'osi4iot init --from-bucket'.",
	Run: func(cmd *cobra.Command, args []string) {
		err := runStateRecover(log.New(os.Stdout, "", 0), stateRecoverSource{
			File:        stateRecoverFile,
			FromGarage:  stateRecoverFromGar,
			GarageImage: stateRecoverGarageImg,
			Bucket: bucketCredentials{
				Bucket:    stateRecoverBucket,
				Region:    stateRecoverRegion,
				KeyPrefix: stateRecoverKeyPfx,
			},
		})
		if err != nil {
			exitWithError(err.Error())
		}
	},
}

var cmdCerts = &cobra.Command{
	Use:   "certs",
	Short: "Update domain certificates",
	Long:  "Update domain certificates",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Update domain certificates")
	},
}

var cmdStatus = &cobra.Command{
	Use:   "status",
	Short: "Show the platform's state, services and nodes",
	Long: "Shows the platform's state as the other commands see it — not defined, deleted, " +
		"stopped, running, running with problems, or unknown — and why: the services that do " +
		"not have all their tasks running, or what could not be reached. Then the services, " +
		"the object store (Garage instances per node, and any change left half-way), and the " +
		"nodes as Swarm sees them.\n\n" +
		"Read-only, and it works when the platform does not: an unreachable manager is " +
		"reported, not an error.",
	Run: func(cmd *cobra.Command, args []string) {
		runStatus()
	},
}

var cmdState = &cobra.Command{
	Use:   "state",
	Short: "Platform state management",
	Long: "Local operations on the platform state file: export it as plain JSON, and recover " +
		"it from a backup when the platform cannot hand it back.\n\n" +
		"The state file's S3 backups live under 'osi4iot backup', alongside the other backup " +
		"targets — a copy is stored automatically every time the file changes.",
}

var subCmdStateExport = &cobra.Command{
	Use:   "export",
	Short: "Export platform state as unencrypted JSON",
	Long:  "Decrypt and export osi4iot_state.json to osi4iot_state_unencrypted.json",
	Run: func(cmd *cobra.Command, args []string) {
		if !utils.ExistStateFile() {
			exitWithError("No state file found. Create a platform first.")
		}

		fmt.Print("🔑 Enter passphrase to decrypt the state file: ")
		passphrase, err := crypto.PromptPassphrase()
		if err != nil {
			exitWithError(fmt.Sprintf("Error reading passphrase: %v", err))
		}
		fmt.Println()

		if err := utils.ExportUnencrypted(passphrase); err != nil {
			exitWithError(fmt.Sprintf("Error exporting state file: %v", err))
		}

		okMsg := utils.StyleOKMsg.Render("State exported to osi4iot_state_unencrypted.json")
		fmt.Println(okMsg)
	},
}

var cmdPassphrase = &cobra.Command{
	Use:   "passphrase",
	Short: "Passphrase management",
	Long:  "Manage the osi4iot state file passphrase",
}

var subCmdPassphraseReset = &cobra.Command{
	Use:   "reset",
	Short: "Reset the saved passphrase",
	Long:  "Remove the saved passphrase so it will be prompted again on the next command",
	Run: func(cmd *cobra.Command, args []string) {
		crypto.ClearPassphrase()
		okMsg := utils.StyleOKMsg.Render("Passphrase cleared. You will be prompted on the next command.")
		fmt.Println(okMsg)
	},
}

var cmdStreams = &cobra.Command{
	Use:   "streams",
	Short: "NATS JetStream streams management",
	Long: "Shows the JetStream streams of the running NATS, read live: replicas, leader, " +
		"messages and whether they are in sync. Backups of the streams are in 'osi4iot backup' " +
		"(trigger, list, restore nats_streams), stored in the platform's bucket.",
}

var subCmdStreamsList = &cobra.Command{
	Use:     "ls",
	Aliases: []string{"list"},
	Short:   "List the NATS JetStream streams currently in the cluster",
	Long:    "Lists every JetStream stream with its replica count, leader, message count and sync status.",
	Run: func(cmd *cobra.Command, args []string) {
		pd := data.GetData()

		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}

		streams, err := docker.ListNatsStreams(pd, dc)
		if err != nil {
			exitWithError(fmt.Sprintf("Error listing NATS streams: %v", err))
		}

		if len(streams) == 0 {
			fmt.Println(utils.StyleOKMsg.Render("No NATS streams found"))
			return
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
		fmt.Fprintln(w, "NAME\tREPLICAS\tLEADER\tMESSAGES\tSTATUS")
		for _, s := range streams {
			leader := s.Leader
			if leader == "" {
				leader = "-"
			}

			status := "ok"
			switch {
			case s.Peers <= 1:
				status = "standalone"
			case !s.AllCurrent:
				status = "lagging"
			case s.Peers < s.Replicas:
				status = "under-replicated"
			}

			fmt.Fprintf(w, "%s\t%d\t%s\t%d\t%s\n", s.Name, s.Replicas, leader, s.Messages, status)
		}
		w.Flush()
	},
}

// confirmStreamsAction prompts the user for a yes/no confirmation and returns
// true only on an explicit "y"/"yes".
func confirmStreamsAction(prompt string) bool {
	fmt.Printf("%s [y/N]: ", prompt)
	var answer string
	fmt.Scanln(&answer)
	answer = strings.ToLower(strings.TrimSpace(answer))
	return answer == "y" || answer == "yes"
}

func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().Bool("no-encrypt", false, "Disable encryption for debugging (plain text osi4iot_state.json)")
	rootCmd.AddCommand(cmdVersion)
	rootCmd.AddCommand(cmdCreate)
	rootCmd.AddCommand(cmdInit)
	cmdInit.PersistentFlags().StringSlice("exclude", []string{}, "List of services to exclude")
	cmdInit.Flags().String(snapshotFileFlag, "", "Snapshot to bring this platform up from")
	cmdInit.Flags().String(fromBucketFlag, "", "Bucket to bring this platform back from")
	cmdInit.Flags().String(nodesFileFlag, "", "nodes.json describing the machines to use")
	cmdInit.Flags().String(statePrefixFlag, "", "Key prefix of the state file backups")
	cmdInit.Flags().String(bucketRegionFlg, "", "Bucket region")
	cmdInit.Flags().BoolP(assumeYesFlag, "y", false, "Do not ask for confirmation")
	cmdInit.Flags().Bool(resetPasswordsFlag, false,
		"Replace every generated secret (new empty platform from an old state file; "+
			"not with --snapshot-file or --from-bucket)")
	rootCmd.AddCommand(cmdRun)
	cmdRun.PersistentFlags().StringSlice("exclude", []string{}, "List of services to exclude")
	rootCmd.AddCommand(cmdStop)
	rootCmd.AddCommand(cmdDelete)
	rootCmd.AddCommand(cmdStatus)

	cmdCustomService.AddCommand(subCmdListCS)
	cmdCustomService.AddCommand(subCmdUpdateCS)
	cmdCustomService.AddCommand(subCmdAddCS)
	cmdCustomService.AddCommand(subCmdRemoveCS)
	rootCmd.AddCommand(cmdCustomService)

	cmdService.AddCommand(subCmdServiceList)
	cmdService.AddCommand(subCmdServiceInspect)
	cmdService.AddCommand(subCmdServiceScale)
	cmdService.AddCommand(subCmdServiceRebalance)
	cmdService.AddCommand(subCmdServiceUpdateResources)
	cmdService.AddCommand(subCmdServiceUpdateImage)
	rootCmd.AddCommand(cmdService)

	cmdCerts.AddCommand(subCmdCertsCheck)
	cmdCerts.AddCommand(subCmdCertsUpdate)
	cmdCerts.AddCommand(subCmdCertsDownload)
	rootCmd.AddCommand(cmdCerts)

	subCmdStateRecover.Flags().StringVar(&stateRecoverFile, "file", "",
		"path to a backup you downloaded yourself; needs no running platform")
	subCmdStateRecover.Flags().BoolVar(&stateRecoverFromGar, "from-garage", false,
		"read the backup out of the garage volumes, for a stopped Garage deployment")
	subCmdStateRecover.Flags().StringVar(&stateRecoverGarageImg, "garage-image", "",
		"Garage image for --from-garage (default: the version this platform ran)")

	subCmdStateRecover.Flags().StringVar(&stateRecoverBucket, "from-bucket", "",
		"External S3 bucket to read the backups from")
	subCmdStateRecover.Flags().StringVar(&stateRecoverRegion, "bucket-region", "",
		"Bucket region (default: the AWS environment, or us-east-1)")
	subCmdStateRecover.Flags().StringVar(&stateRecoverKeyPfx, "state-prefix", "",
		"Key prefix of the state file backups (default: backups/state_file)")

	cmdDelete.Flags().Bool("no-final-backups", false,
		"with an external bucket that is kept, do not back the platform up before deleting it")
	cmdDelete.Flags().Bool("remove-bucket", false,
		"Also empty and delete the platform's S3 bucket")

	cmdState.AddCommand(subCmdStateExport)
	cmdState.AddCommand(subCmdStateRecover)
	rootCmd.AddCommand(cmdState)

	cmdPassphrase.AddCommand(subCmdPassphraseReset)
	rootCmd.AddCommand(cmdPassphrase)

	cmdStreams.AddCommand(subCmdStreamsList)
	rootCmd.AddCommand(cmdStreams)

	// Last: cobra only generates `completion` once there are commands.
	addCompletionInstall()
}

func exitWithWarning(errMsg string) {
	docker.CleanResources()
	fmt.Println(utils.StyleWarningMsg.Render(errMsg))
	fmt.Println()
	os.Exit(1)
}

func exitWithError(errMsg string) {
	docker.CleanResources()
	fmt.Println(utils.StyleErrMsg.Render(errMsg))
	fmt.Println()
	os.Exit(1)
}

// takeFinalBackupsBeforeDelete backs the platform up one last time before
// a delete that keeps its external bucket. A backup that fails is not
// silently accepted: the bucket would hold that part as of its last
// backup, so the operator decides whether to go on. Nothing has been
// removed at that point, so answering no leaves the platform untouched.
func takeFinalBackupsBeforeDelete(pd *pt.PlatformData, dc *pt.DockerClient) {
	logger := log.New(os.Stdout, "", 0)
	// Asked of Swarm directly: the backups go through system_manager, so
	// what matters is that it runs. The platform's overall state is not
	// the question — it reads "initiating" whenever any one task of any
	// service is not healthy, or runs on a node whose containers the
	// manager cannot inspect.
	if !docker.IsSystemManagerRunning(dc) {
		fmt.Println(utils.StyleWarningMsg.Render("system_manager is not running, so no final " +
			"backups can be taken: the bucket holds what was backed up while it ran."))
		answer, err := promptLine("Delete the platform anyway? [y/N]: ")
		if err != nil || !strings.EqualFold(strings.TrimSpace(answer), "y") {
			exitWithError("Cancelled. Nothing has been removed.")
		}
		return
	}

	failed := docker.TakeFinalBackups(pd, dc, logger)
	if len(failed) == 0 {
		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf(
			"s3://%s is up to date: init --from-bucket can rebuild the platform as it is now",
			pd.PlatformInfo.S3BucketName)))
		return
	}

	fmt.Println(utils.StyleWarningMsg.Render(fmt.Sprintf(
		"The final backup of %s could not be taken: the bucket keeps them as of their last "+
			"backup, and anything newer is lost with the platform.", strings.Join(failed, ", "))))
	answer, err := promptLine("Delete the platform anyway? [y/N]: ")
	if err != nil || !strings.EqualFold(strings.TrimSpace(answer), "y") {
		exitWithError("Cancelled. Nothing has been removed.")
	}
}
