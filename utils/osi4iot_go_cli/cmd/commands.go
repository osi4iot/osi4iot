package cmd

import (
	"fmt"
	"log"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/certrenewer"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/ui/form"
	"github.com/spf13/cobra"
)

const version = "0.1.22"

var SwarmActions = []string{"create", "init", "run", "stop", "delete", "service", "certs"}

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
 
			err = docker.InitPlatform(pd)
			if err != nil {
				errMsg := fmt.Sprintf("Error initializing platform: %v", err)
				exitWithError(errMsg)
			}
			okMessage := "Platform has been created successfully and is ready to be used"
			err = docker.SwarmInitiationInfo(pd, okMessage)
			if err != nil {
				errMsg := fmt.Sprintf("Error: initializing the platform %v", err)
				exitWithError(errMsg)
			}
 
			if err := certrenewer.InstallService(pd); err != nil {
				fmt.Printf("⚠️  Warning: could not install cert-renewer service: %v\n", err)
			}
			if err := certrenewer.Start(pd); err != nil {
				fmt.Printf("⚠️  Warning: could not start cert-renewer: %v\n", err)
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
		err := docker.InitPlatform(pd)
		if err != nil {
			errMsg := fmt.Sprintf("Error starting platform: %v", err)
			exitWithError(errMsg)
		}
		okMessage := "Platform has been initialized successfully and is ready to to be used"
		err = docker.SwarmInitiationInfo(pd, okMessage)
		if err != nil {
			errMsg := fmt.Sprintf("Error: initializing the platform %v", err)
			exitWithError(errMsg)
		}
 
		if err := certrenewer.InstallService(pd); err != nil {
			fmt.Printf("⚠️  Warning: could not install cert-renewer service: %v\n", err)
		}
		if err := certrenewer.Start(pd); err != nil {
			fmt.Printf("⚠️  Warning: could not start cert-renewer: %v\n", err)
		}
	},
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
 
			if err := certrenewer.InstallService(pd); err != nil {
				fmt.Printf("⚠️  Warning: could not install cert-renewer service: %v\n", err)
			}
			if err := certrenewer.Start(pd); err != nil {
				fmt.Printf("⚠️  Warning: could not start cert-renewer: %v\n", err)
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
		certrenewer.Stop()
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
		certrenewer.Stop()
		pd := data.GetData()
		err := docker.DeletePlatform(pd)
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

var subCmdCertsRenewerInstall = &cobra.Command{
	Use:   "install",
	Short: "Register cert-renewer with the OS service manager",
	Long:  "Install cert-renewer as a system service (systemd / Windows Service / launchd) so it starts automatically on boot",
	Run: func(cmd *cobra.Command, args []string) {
		pd := data.GetData()
		if err := certrenewer.InstallService(pd); err != nil {
			exitWithError(fmt.Sprintf("Error installing cert-renewer service: %v", err))
		}
	},
}

var subCmdCertsRenewerUninstall = &cobra.Command{
	Use:   "uninstall",
	Short: "Remove cert-renewer from the OS service manager",
	Long:  "Uninstall the cert-renewer system service (stops it first if running)",
	Run: func(cmd *cobra.Command, args []string) {
		if err := certrenewer.UninstallService(); err != nil {
			exitWithError(fmt.Sprintf("Error uninstalling cert-renewer service: %v", err))
		}
	},
}

var subCmdCertsRenewerStart = &cobra.Command{
	Use:   "start",
	Short: "Start cert-renewer background process",
	Long:  "Start the certificate auto-renewal background process",
	Run: func(cmd *cobra.Command, args []string) {
		pd := data.GetData()
		if err := certrenewer.Start(pd); err != nil {
			exitWithError(fmt.Sprintf("Error starting cert-renewer: %v", err))
		}
	},
}

var subCmdCertsRenewerStop = &cobra.Command{
	Use:   "stop",
	Short: "Stop cert-renewer background process",
	Long:  "Stop the certificate auto-renewal background process",
	Run: func(cmd *cobra.Command, args []string) {
		if err := certrenewer.Stop(); err != nil {
			exitWithError(fmt.Sprintf("Error stopping cert-renewer: %v", err))
		}
	},
}

var subCmdCertsCheck = &cobra.Command{
	Use:   "check",
	Short: "Check certificates expiration",
	Long:  "Check certificates expiration",
	Run: func(cmd *cobra.Command, args []string) {
		pd := data.GetData()
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
    Run: func(cmd *cobra.Command, args []string) {
		stdoutLogger := log.New(os.Stdout, "", 0)
        if err := runCertsUpdate(stdoutLogger); err != nil {
            exitWithError(err.Error())
        }
    },
}

var subCmdCertsRenewer = &cobra.Command{
	Use:   "renewer",
	Short: "Cert-renewer background process management",
	Long:  "Manage the certificate auto-renewal background process",
}

var subCmdCertsRenewerDaemon = &cobra.Command{
	Use:    "daemon",
    Hidden: true,
    Run: func(cmd *cobra.Command, args []string) {
		domainName := data.GetDomainName()
        certrenewer.RunDaemon(func(logger *log.Logger) error {
            return runCertsUpdate(logger)
        }, domainName)
    },
}

var subCmdCertsRenewerLogs = &cobra.Command{
	Use:   "logs",
	Short: "Show cert-renewer logs",
	Run: func(cmd *cobra.Command, args []string) {
		follow, _ := cmd.Flags().GetBool("follow")
		lines, _ := cmd.Flags().GetInt("lines")
		domainName := data.GetDomainName()
		certrenewer.ShowLogs(follow, lines, domainName)
	},
}

var subCmdCertsRenewerStatus = &cobra.Command{
	Use:   "status",
	Short: "Show cert-renewer background process status",
	Run: func(cmd *cobra.Command, args []string) {
		certrenewer.Status()
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

var cmdNodes = &cobra.Command{
	Use:   "nodes",
	Short: "Nodes management",
	Long:  "Add, update, list and remove nodes from the platform",
}

var subCmdNodesList = &cobra.Command{
	Use:   "list",
	Short: "List nodes",
	Long:  "List nodes",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("List nodes")
	},
}

var subCmdAddNode = &cobra.Command{
	Use:   "add",
	Short: "Add node",
	Long:  "Add node",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Add node")
	},
}

var subCmdRemoveNode = &cobra.Command{
	Use:   "remove",
	Short: "Remove node",
	Long:  "Remove node",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Remove node")
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
	Long:  "Manage the platform state file",
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

	subCmdCertsRenewer.AddCommand(subCmdCertsRenewerInstall)
	subCmdCertsRenewer.AddCommand(subCmdCertsRenewerUninstall)
	subCmdCertsRenewer.AddCommand(subCmdCertsRenewerStart)
	subCmdCertsRenewer.AddCommand(subCmdCertsRenewerStop)
	subCmdCertsRenewer.AddCommand(subCmdCertsRenewerDaemon)
	subCmdCertsRenewerLogs.Flags().BoolP("follow", "f", false, "Follow log output")
	subCmdCertsRenewerLogs.Flags().IntP("lines", "n", 50, "Number of lines to show")
	subCmdCertsRenewer.AddCommand(subCmdCertsRenewerLogs)
	subCmdCertsRenewer.AddCommand(subCmdCertsRenewerStatus)
	cmdCerts.AddCommand(subCmdCertsCheck)
	cmdCerts.AddCommand(subCmdCertsUpdate)
	cmdCerts.AddCommand(subCmdCertsRenewer)
	rootCmd.AddCommand(cmdCerts)

	cmdState.AddCommand(subCmdStateExport)
	rootCmd.AddCommand(cmdState)

	cmdPassphrase.AddCommand(subCmdPassphraseReset)
	rootCmd.AddCommand(cmdPassphrase)

	cmdNodes.AddCommand(subCmdNodesList)
	cmdNodes.AddCommand(subCmdAddNode)
	cmdNodes.AddCommand(subCmdRemoveNode)
	rootCmd.AddCommand(cmdNodes)

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