package cmd

import (
	"fmt"
	"log"
	"os"
	"regexp"
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

const version = "0.1.37"

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
var SwarmActions = []string{"create", "init", "run", "stop", "delete", "service", "certs", "streams", "node", "backup"}

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "osi4iot",
	Short: "osi4iot is a CLI tool for OSI4IOT",
	Long:  `osi4iot is a CLI tool for OSI4IOT`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		noEncrypt, _ := cmd.Flags().GetBool("no-encrypt")
		crypto.SetNoEncrypt(noEncrypt)
	},
	// Run: func(cmd *cobra.Command, args []string) {},
}

var cmdVersion = &cobra.Command{
	Use:   "version",
	Short: "Show osi4iot version",
	Long:  "Show osi4iot version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("osi4iot CLI version: %s\n", version)
	},
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
	Long:  "Delete platform",
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
					"s3://%s holds %d object(s): every backup this platform has. "+
						"They cannot be recovered afterwards.",
					pd.PlatformInfo.S3BucketName, count)))
				// confirmación
			}
			if err := docker.RemovePlatformBucket(pd, dc, logger); err != nil {
				exitWithError(err.Error())
			}
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
	stateRecoverFile     string
	stateRecoverFromMin  bool
	stateRecoverMinioImg string
	stateRecoverBucket   string
	stateRecoverRegion   string
	stateRecoverKeyPfx   string
)

var subCmdStateRecover = &cobra.Command{
	Use:   "recover",
	Short: "Rebuild the local state file without going through the platform",
	Long: "Recover osi4iot_state.json when the platform cannot hand it back — because it is " +
		"stopped, or because the state file itself is gone or unreadable. Decrypts a stored " +
		"backup and writes it out under this machine's passphrase; the file being replaced, " +
		"if any, is kept alongside it with a .bak-<timestamp> suffix.\n\n" +
		"--file installs a backup you downloaded yourself, from the AWS or MinIO console or " +
		"with any S3 client. It needs nothing but the passphrase: no platform, no network, " +
		"no existing state file.\n\n" +
		"--from-minio covers a MinIO deployment whose platform is stopped, where there is no " +
		"console to download from. It starts a temporary MinIO against the minio_storage " +
		"volume, reads the backup out and takes it down again, over SSH if the volume is on " +
		"another node. It needs the platform admin user and password, which are MinIO's root " +
		"credentials.\n\n" +
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
			File:       stateRecoverFile,
			FromMinio:  stateRecoverFromMin,
			MinioImage: stateRecoverMinioImg,
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
	Short: "Platform status",
	Long:  "Platform status",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Platform status")
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
	Long: "List NATS JetStream streams, and manage the local snapshots the scale up/down flow " +
		"takes of its own accord mid-operation (see 'osi4iot backup' for the S3-backed periodic " +
		"backup/restore of NATS, patroni_admin and patroni_metrics).",
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
	cmdService.AddCommand(subCmdServiceUpdateResources)
	cmdService.AddCommand(subCmdServiceUpdateImage)
	rootCmd.AddCommand(cmdService)

	cmdCerts.AddCommand(subCmdCertsCheck)
	cmdCerts.AddCommand(subCmdCertsUpdate)
	cmdCerts.AddCommand(subCmdCertsDownload)
	rootCmd.AddCommand(cmdCerts)

	subCmdStateRecover.Flags().StringVar(&stateRecoverFile, "file", "",
		"path to a backup you downloaded yourself; needs no running platform")
	subCmdStateRecover.Flags().BoolVar(&stateRecoverFromMin, "from-minio", false,
		"read the backup out of the minio_storage volume, for a stopped MinIO deployment")
	subCmdStateRecover.Flags().StringVar(&stateRecoverMinioImg, "minio-image", "",
		"MinIO image for --from-minio (default: the version this platform ran)")

	subCmdStateRecover.Flags().StringVar(&stateRecoverBucket, "from-bucket", "",
		"External S3 bucket to read the backups from")
	subCmdStateRecover.Flags().StringVar(&stateRecoverRegion, "bucket-region", "",
		"Bucket region (default: the AWS environment, or us-east-1)")
	subCmdStateRecover.Flags().StringVar(&stateRecoverKeyPfx, "state-prefix", "",
		"Key prefix of the state file backups (default: backups/state_file)")

	cmdState.AddCommand(subCmdStateExport)
	cmdState.AddCommand(subCmdStateRecover)
	rootCmd.AddCommand(cmdState)

	cmdPassphrase.AddCommand(subCmdPassphraseReset)
	rootCmd.AddCommand(cmdPassphrase)

	cmdStreams.AddCommand(subCmdStreamsList)
	rootCmd.AddCommand(cmdStreams)
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
