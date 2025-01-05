package cmd

import (
	"fmt"
	"os"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	initiatePlatform "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/initatePlatform"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/spf13/cobra"
)

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "osi4iot_go_cli",
	Short: "osi4iot_go_cli is a CLI tool for OSI4IOT",
	Long:  `osi4iot_go_cli is a CLI tool for OSI4IOT`,
	// Run: func(cmd *cobra.Command, args []string) {
	// 	fmt.Println("Hello World")
	// },
}

var cmdInit = &cobra.Command{
	Use:   "init",
	Short: "Init a new platform",
	Long:  "Init a new platform",
	Run: func(cmd *cobra.Command, args []string) {
		platformState := data.GetPlatformState()
		if platformState == data.Running {
			errMsg := utils.StyleWarningMsg.Render("The platform is already running. Please stop it before initializing a new one")
			fmt.Println(errMsg)
		} else {
			initiatePlatform.Create()
			platformState = data.GetPlatformState()
			if platformState == data.Initiating {
				err := data.SwarmInitiationInfo()
				if err != nil {
					errMsg := utils.StyleErrMsg.Render("Error: initializing the platform ", err.Error())
					fmt.Println(errMsg)
				}
			}
		}
	},
}

var cmdRun = &cobra.Command{
	Use:   "run",
	Short: "Start osi4iot platform",
	Long:  "Start osi4iot platform",
	Run: func(cmd *cobra.Command, args []string) {
		err := data.RunSwarm()
		if err != nil {
			errMsg := utils.StyleErrMsg.Render("Error: runing the platform ", err.Error())
			fmt.Println(errMsg)
		} else {
			fmt.Println("Platform has been started successfully")
			err := data.SwarmInitiationInfo()
			if err != nil {
				errMsg := utils.StyleErrMsg.Render("Error: initializing the platform ", err.Error())
				fmt.Println(errMsg)
			}
		}
	},
}

var cmdOrgs = &cobra.Command{
	Use:   "orgs",
	Short: "Organizations management",
	Long:  "Organizations management",
	// Run: func(cmd *cobra.Command, args []string) {
	// 	fmt.Println("Organizations management")
	// },
}

var subCmdOrgsList = &cobra.Command{
	Use:   "list",
	Short: "List organizations",
	Long:  "List organizations",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("List organizations")
	},
}

var subCmdUpdateOrg = &cobra.Command{
	Use:   "update",
	Short: "Update organizations",
	Long:  "Update organizations",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Update organization")
	},
}

var subCmdAddOrg = &cobra.Command{
	Use:   "add",
	Short: "Add organization",
	Long:  "Add organization",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Add organization")
	},
}

var subCmdRemoveOrg = &cobra.Command{
	Use:   "remove",
	Short: "Remove organization",
	Long:  "Remove organization",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Remove organization")
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

var cmdNri = &cobra.Command{
	Use:   "nri",
	Short: "Recover node-red instances",
	Long:  "Recover node-red instances",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Recover node-red instances")
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
		fmt.Println("UPlatform status")
	},
}

var cmdStop = &cobra.Command{
	Use:   "stop",
	Short: "Stop platform",
	Long:  "Stop platform",
	Run: func(cmd *cobra.Command, args []string) {
		err := data.StopPlatform()
		if err != nil {
			errMsg := utils.StyleErrMsg.Render("Error: stopping the platform ", err.Error())
			fmt.Println(errMsg)
		} else {
			okMsg := utils.StyleOKMsg.Render("Platform has been sttoped successfully")
			fmt.Println(okMsg)
		}
	},
}

var cmdDelete = &cobra.Command{
	Use:   "delete",
	Short: "Delete platform",
	Long:  "Delete platform",
	Run: func(cmd *cobra.Command, args []string) {
		err := data.DeletePlatform()
		if err != nil {
			errMsg := utils.StyleErrMsg.Render("Error: deleting the platform ", err.Error())
			fmt.Println(errMsg)
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
	err := data.ReadPlatformDataFromFile()
	if err != nil {
		panic(fmt.Sprintf("Error loading json file: %v", err))
	}

	err = data.SetInitialPlatformState()
	if err != nil {
		panic(fmt.Sprintf("Error setting initial platform state: %v", err))
	}

	rootCmd.AddCommand(cmdInit)
	rootCmd.AddCommand(cmdRun)
	rootCmd.AddCommand(cmdStop)

	cmdOrgs.AddCommand(subCmdOrgsList)
	cmdOrgs.AddCommand(subCmdUpdateOrg)
	cmdOrgs.AddCommand(subCmdAddOrg)
	cmdOrgs.AddCommand(subCmdRemoveOrg)
	rootCmd.AddCommand(cmdOrgs)

	cmdCustomService.AddCommand(subCmdListCS)
	cmdCustomService.AddCommand(subCmdUpdateCS)
	cmdCustomService.AddCommand(subCmdAddCS)
	cmdCustomService.AddCommand(subCmdRemoveCS)
	rootCmd.AddCommand(cmdCustomService)

	cmdNodes.AddCommand(subCmdNodesList)
	cmdNodes.AddCommand(subCmdAddNode)
	cmdNodes.AddCommand(subCmdRemoveNode)
	rootCmd.AddCommand(cmdNodes)

	rootCmd.AddCommand(cmdNri)
	rootCmd.AddCommand(cmdCerts)
	rootCmd.AddCommand(cmdStatus)
	rootCmd.AddCommand(cmdStop)
	rootCmd.AddCommand(cmdDelete)
}
