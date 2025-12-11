package cmd

import (
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/ui/form"
	"github.com/spf13/cobra"
)

var SwarmActions = []string{"create", "init", "run", "stop", "delete", "service"}

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "osi4iot_go_cli",
	Short: "osi4iot_go_cli is a CLI tool for OSI4IOT",
	Long:  `osi4iot_go_cli is a CLI tool for OSI4IOT`,
	// Run: func(cmd *cobra.Command, args []string) {},
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
			platformData := data.GetData()
			_, err := docker.SetDockerClientsMap(platformData, "create")
			if err != nil {
				errMsg := fmt.Sprintf("Error setting Docker clients map: %v", err)
				exitWithError(errMsg)
			}
			defer func() {
				docker.CleanResources()
			}()

			err = docker.InitPlatform(platformData)
			if err != nil {
				errMsg := fmt.Sprintf("Error initializing platform: %v", err)
				exitWithError(errMsg)
			}
			okMessage := "Platform has been created successfully and is ready to be used"
			err = docker.SwarmInitiationInfo(platformData, okMessage)
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
		platformData := data.GetData()
		err := docker.InitPlatform(platformData)
		if err != nil {
			errMsg := fmt.Sprintf("Error starting platform: %v", err)
			exitWithError(errMsg)
		}
		okMessage := "Platform has been initialized successfully and is ready to to be used"
		err = docker.SwarmInitiationInfo(platformData, okMessage)
		if err != nil {
			errMsg := fmt.Sprintf("Error: initializing the platform %v", err)
			exitWithError(errMsg)
		}
	},
}

var cmdRun = &cobra.Command{
	Use:   "run",
	Short: "Start osi4iot platform",
	Long:  "Start osi4iot platform",
	Run: func(cmd *cobra.Command, args []string) {
		checkState("run")
		platformData := data.GetData()
		excludedServices, _ := cmd.Flags().GetStringSlice("exclude")
		platformData.PlatformInfo.ExcludedServices = excludedServices
		dc, err := docker.GetManagerDC()
		if err != nil {
			errMsg := fmt.Sprintf("Error: getting docker client %v", err)
			exitWithError(errMsg)
		}
		err = docker.RunSwarm(dc, platformData)
		if err != nil {
			errMsg := fmt.Sprintf("Error: runing the platform %v", err)
			exitWithError(errMsg)
		} else {
			platformData := data.GetData()
			okMessage := "Platform has been started successfully and is ready to to be used"
			err = docker.SwarmInitiationInfo(platformData, okMessage)
			if err != nil {
				errMsg := fmt.Sprintf("Error: initializing the platform %v", err)
				exitWithError(errMsg)
			}
		}
	},
}

var cmdService = &cobra.Command{
	Use:   "service",
	Short: "Services management",
	Long:  "Services management",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Services management")
	},
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
	Use:   "inspect [SERVICE_NAME]",
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

		service, err := docker.InspectService(dc, serviceName)
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

var cmdServiceScale = &cobra.Command{
	Use:   "scale [SERVICE_NAME=REPLICAS].",
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
		okMsg := utils.StyleOKMsg.Render(fmt.Sprintf("Service '%s' has been scaled to %d replicas successfully", serviceName, replicas))
		fmt.Println(okMsg)
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
	// Run: func(cmd *cobra.Command, args []string) {
	// 	fmt.Println("Nodes management")
	// },
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
		fmt.Println("Add node")
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

var cmdStop = &cobra.Command{
	Use:   "stop",
	Short: "Stop platform",
	Long:  "Stop platform",
	Run: func(cmd *cobra.Command, args []string) {
		checkState("stop")
		platformData := data.GetData()
		err := docker.StopPlatform(platformData)
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
		platformData := data.GetData()
		err := docker.DeletePlatform(platformData)
		if err != nil {
			errMsg := fmt.Sprintf("Error: deleting the platform %v", err)
			exitWithError(errMsg)
		} else {
			okMsg := utils.StyleOKMsg.Render("Platform has been deleted successfully")
			fmt.Println(okMsg)
		}
	},
}

func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(cmdCreate)
	rootCmd.AddCommand(cmdInit)
	cmdInit.PersistentFlags().StringSlice("exclude", []string{}, "List of services to exclude")
	rootCmd.AddCommand(cmdRun)
	cmdRun.PersistentFlags().StringSlice("exclude", []string{}, "List of services to exclude")
	rootCmd.AddCommand(cmdStop)
	rootCmd.AddCommand(cmdDelete)
	rootCmd.AddCommand(cmdCerts)
	rootCmd.AddCommand(cmdStatus)

	cmdCustomService.AddCommand(subCmdListCS)
	cmdCustomService.AddCommand(subCmdUpdateCS)
	cmdCustomService.AddCommand(subCmdAddCS)
	cmdCustomService.AddCommand(subCmdRemoveCS)
	rootCmd.AddCommand(cmdCustomService)

	cmdService.AddCommand(subCmdServiceList)
	cmdService.AddCommand(subCmdServiceInspect)
	cmdService.AddCommand(cmdServiceScale)
	rootCmd.AddCommand(cmdService)

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
