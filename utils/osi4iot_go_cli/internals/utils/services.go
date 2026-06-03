package utils

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/lipgloss"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/swarm"
	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// ServiceUpdateProgress contains progress information for service updates
type ServiceUpdateProgress struct {
	Running      int
	Ready        int
	Preparing    int
	Failed       int
	Shutdown     int
	Total        int
	UpdateStatus string
	Message      string
}

func FindServiceDataByName(pd *osi_types.PlatformData, serviceName string) (int, *osi_types.ServiceData, error) {
	for svcIdx, svcData := range pd.PlatformInfo.ServicesData {
		if svcData.ServiceName == serviceName {
			return svcIdx, &svcData, nil
		}
	}
	return -1, nil, fmt.Errorf("service data for '%s' not found", serviceName)
}

func GetScalableServices(pd *osi_types.PlatformData) []string {
	scalableServices := []string{
		"admin_api",
		"frontend",
		"nats",
		"auth_callout",
		"grafana",
		"pipelines",
		"traefik",
	}

	return scalableServices
}

func ServicesList(services []swarm.Service) {
	services = sortServicesByName(services)

	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("34")).
		Padding(1, 0)

	headerStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("42")).
		Padding(0, 1)

	cellStyle := lipgloss.NewStyle().
		Padding(0, 1)

	selectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(""))

	footerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("241")).
		Italic(true).
		Padding(1, 0)

	// Título
	fmt.Println(titleStyle.Render("🐳 OSI4IOT platform Services"))

	// Columnas
	columns := []table.Column{
		{Title: "ID", Width: 12},
		{Title: "NAME", Width: 20},
		{Title: "MODE", Width: 10},
		{Title: "REPLICAS", Width: 10},
		{Title: "IMAGE", Width: 40},
		{Title: "PORTS", Width: 40},
	}

	// Preparar filas
	rows := make([]table.Row, 0, len(services))
	for _, service := range services {
		shortID := service.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}

		name := service.Spec.Name
		if len(name) > 20 {
			name = name[:17] + "..."
		}

		mode := ""
		replicas := ""
		if service.Spec.Mode.Replicated != nil {
			mode = "replicated"
			if service.Spec.Mode.Replicated.Replicas != nil {
				replicas = fmt.Sprintf("%d", *service.Spec.Mode.Replicated.Replicas)
			}
		} else if service.Spec.Mode.Global != nil {
			mode = "global"
			replicas = "global"
		}

		image := service.Spec.TaskTemplate.ContainerSpec.Image
		if idx := strings.Index(image, "@sha256:"); idx != -1 {
			image = image[:idx]
		}
		if len(image) > 40 {
			image = image[:37] + "..."
		}

		ports := formatPorts(service.Endpoint.Ports)
		if len(ports) > 40 {
			ports = ports[:37] + "..."
		}

		rows = append(rows, table.Row{
			shortID, name, mode, replicas, image, ports,
		})
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithHeight(len(rows)),
		table.WithFocused(false),
	)

	s := table.DefaultStyles()
	s.Header = headerStyle
	s.Cell = cellStyle
	s.Selected = selectedStyle
	t.SetStyles(s)

	// Renderizar tabla con borde
	tableView := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")).
		Padding(1, 2).
		Render(t.View())

	fmt.Println(tableView)

	// Footer
	fmt.Println(footerStyle.Render(fmt.Sprintf("Total services: %d", len(services))))

}

func InspectService(pd *osi_types.PlatformData, service *swarm.Service, networks []network.Summary) error {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("34"))
		//Padding(1, 0)

	labelStyle := lipgloss.NewStyle().
		Bold(true).
		//Foreground(lipgloss.Color("42")).
		Foreground(lipgloss.Color("")).
		Width(10)

	boldStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("")).
		Bold(true)

	valueStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(""))

	sectionStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("34")).
		Underline(true).
		Padding(1, 0, 0, 0)

	// Title
	fmt.Println(titleStyle.Render(fmt.Sprintf("\n🔍 Service Details: %s", service.Spec.Name)))

	// Basic Information
	fmt.Println(sectionStyle.Render("Basic Information"))
	fmt.Printf("%s %s\n", labelStyle.Render("Name:"), valueStyle.Render(service.Spec.Name))
	fmt.Printf("%s %s\n", labelStyle.Render("ID:"), valueStyle.Render(service.ID))
	fmt.Printf("%s %s\n", labelStyle.Render("Created:"), valueStyle.Render(service.CreatedAt.Format("2006-01-02 15:04:05")))
	fmt.Printf("%s %s\n", labelStyle.Render("Updated:"), valueStyle.Render(service.UpdatedAt.Format("2006-01-02 15:04:05")))

	// Container
	fmt.Println(sectionStyle.Render("Container"))
	image := service.Spec.TaskTemplate.ContainerSpec.Image
	if idx := strings.Index(image, "@sha256:"); idx != -1 {
		fmt.Printf("%s %s\n", labelStyle.Render("Image:"), valueStyle.Render(image[:idx]))
		fmt.Printf("%s %s\n", labelStyle.Render("Digest:"), valueStyle.Render(image[idx+1:]))
	} else {
		fmt.Printf("%s %s\n", labelStyle.Render("Image:"), valueStyle.Render(image))
	}

	// Deployment
	fmt.Println(sectionStyle.Render("Deployment"))
	if service.Spec.Mode.Replicated != nil {
		fmt.Printf("%s %s\n", labelStyle.Render("Mode:"), valueStyle.Render("Replicated"))
		if service.Spec.Mode.Replicated.Replicas != nil {
			fmt.Printf("%s %s\n", labelStyle.Render("Replicas:"), valueStyle.Render(fmt.Sprintf("%d", *service.Spec.Mode.Replicated.Replicas)))
		}
	} else if service.Spec.Mode.Global != nil {
		fmt.Printf("%s %s\n", labelStyle.Render("Mode:"), valueStyle.Render("Global"))
	}

	// Ports
	if len(service.Endpoint.Ports) > 0 {
		fmt.Println(sectionStyle.Render("Ports"))
		for idx, port := range service.Endpoint.Ports {
			portInfo := fmt.Sprintf("*:%d -> %d/%s", port.PublishedPort, port.TargetPort, port.Protocol)
			if port.PublishMode != "" {
				portInfo += fmt.Sprintf(" (mode: %s)", port.PublishMode)
			}
			portIdx := fmt.Sprintf("Port %d:", idx+1)
			fmt.Printf("%s %s\n", labelStyle.Render(portIdx), valueStyle.Render(portInfo))
		}
	}

	// Resoucures
	if service.Spec.TaskTemplate.Resources != nil {
		fmt.Println(sectionStyle.Render("Resources"))
		if service.Spec.TaskTemplate.Resources.Limits != nil {
			limits := service.Spec.TaskTemplate.Resources.Limits
			cpu := float64(limits.NanoCPUs) / 1e9
			memoryMB := float64(limits.MemoryBytes) / (1024 * 1024)
			fmt.Printf("%s %s\n",
				labelStyle.Render("CPU:"),
				valueStyle.Render(fmt.Sprintf("%.2f CPUs", cpu)),
			)
			fmt.Printf("%s %s\n",
				labelStyle.Render("Memory:"),
				valueStyle.Render(fmt.Sprintf("%.2f MB", memoryMB)),
			)
		}
	} else {
		fmt.Printf("%s %s\n", labelStyle.Render("Resources:"), valueStyle.Render("No resource limits set"))
	}

	// Environment Variables
	if len(service.Spec.TaskTemplate.ContainerSpec.Env) > 0 {
		fmt.Println(sectionStyle.Render("Environment Variables"))
		for idx, env := range service.Spec.TaskTemplate.ContainerSpec.Env {
			envIdx := fmt.Sprintf("Env %d:", idx+1)
			fmt.Printf("%s %s\n", labelStyle.Render(envIdx), valueStyle.Render(env))
		}
	}

	// Mounts (Mounts/Volumes)
	if len(service.Spec.TaskTemplate.ContainerSpec.Mounts) > 0 {
		fmt.Println(sectionStyle.Render("Mounts"))
		for idx, mount := range service.Spec.TaskTemplate.ContainerSpec.Mounts {
			mountIdx := fmt.Sprintf("Mount %d:", idx+1)
			mountInfo := fmt.Sprintf("%s -> %s (type: %s)", mount.Source, mount.Target, mount.Type)
			if mount.ReadOnly {
				mountInfo += " [read-only]"
			}
			fmt.Printf("%s %s\n", labelStyle.Render(mountIdx), valueStyle.Render(mountInfo))
		}
	}

	// Networks
	if len(networks) > 0 {
		fmt.Println(sectionStyle.Render("Networks"))
		for idx, network := range networks {
			networkIdx := fmt.Sprintf("Network %d:", idx+1)
			fmt.Printf("%s Name: %s, ID: %s \n",
				boldStyle.Render(networkIdx),
				network.Name,
				network.ID,
			)
		}
	}

	// // Labels
	// if len(service.Spec.Labels) > 0 {
	// 	fmt.Println(sectionStyle.Render("Labels"))
	// 	for key, value := range service.Spec.Labels {
	// 		fmt.Printf("  %s = %s\n", labelStyle.Render(key), valueStyle.Render(value))
	// 	}
	// }

	// Placement Constraints
	if len(service.Spec.TaskTemplate.Placement.Constraints) > 0 {
		fmt.Println(sectionStyle.Render("Placement Constraints"))
		for _, constraint := range service.Spec.TaskTemplate.Placement.Constraints {
			fmt.Printf("  %s\n", valueStyle.Render(constraint))
		}
	}

	fmt.Println()
	return nil
}

func sortServicesByName(services []swarm.Service) []swarm.Service {
	sort.Slice(services, func(i, j int) bool {
		return services[i].Spec.Name < services[j].Spec.Name
	})
	return services
}

func formatPorts(ports []swarm.PortConfig) string {
	if len(ports) == 0 {
		return "-"
	}

	var portStrings []string
	for _, port := range ports {
		if port.PublishedPort > 0 {
			portStrings = append(portStrings,
				fmt.Sprintf("*:%d->%d/%s", port.PublishedPort, port.TargetPort, port.Protocol))
		}
	}

	if len(portStrings) == 0 {
		return "-"
	}

	return strings.Join(portStrings, ", ")
}

func GetServiceReplicas(pd *osi_types.PlatformData, serviceName string) int {
	_, svcData, err := FindServiceDataByName(pd, serviceName)
	if err != nil {
		return 1
	}

	if svcData.Replicas < 1 {
		return 1
	}

	return svcData.Replicas
}

func GetServiceImage(pd *osi_types.PlatformData, serviceName string, defaultImage string) string {
	_, svcData, err := FindServiceDataByName(pd, serviceName)
	if err != nil {
		return defaultImage
	}
	if svcData.Image == "" {
		return defaultImage
	}

	return svcData.Image
}

// MonitorServiceUpdateWithProgressBar monitors both scaling and rolling updates
// It shows progress for new replicas, updated replicas, and failed tasks
func MonitorServiceUpdateWithProgressBar(dc *osi_types.DockerClient, serviceID string, targetReplicas uint64, isUpdate bool) error {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	timeout := time.After(10 * time.Minute)
	var allRunningStableSince time.Time
	const stableThreshold = 5 * time.Second

	progressStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("34"))
	successStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("40"))
	warningStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	errorStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("196"))

	barWidth := 30
	fmt.Println("")
	ctx := context.Background()

	updateStarted := false

	// Función helper para limpiar la línea
	clearLine := func() {
		fmt.Print("\r\033[K") // \r mueve al inicio, \033[K borra hasta el final de la línea
	}

	for {
		select {
		case <-timeout:
			fmt.Println()
			return fmt.Errorf("timeout waiting for service update to complete")
		case <-ticker.C:
			service, _, err := dc.Cli.ServiceInspectWithRaw(ctx, serviceID, types.ServiceInspectOptions{})
			if err != nil {
				fmt.Println()
				return fmt.Errorf("failed to inspect service: %w", err)
			}

			if isUpdate && service.UpdateStatus != nil {
				if !updateStarted {
					updateStarted = true
				}
			}

			taskFilters := filters.NewArgs()
			taskFilters.Add("service", serviceID)
			taskFilters.Add("desired-state", "running")

			tasks, err := dc.Cli.TaskList(ctx, types.TaskListOptions{
				Filters: taskFilters,
			})
			if err != nil {
				fmt.Println()
				return fmt.Errorf("failed to list tasks: %w", err)
			}

			progress := analyzeTaskProgress(tasks, targetReplicas)

			var progressPercent float64
			if isUpdate {
				progressPercent = float64(progress.Running) / float64(targetReplicas)
			} else {
				progressPercent = float64(progress.Running) / float64(targetReplicas)
			}

			if progressPercent > 1.0 {
				progressPercent = 1.0
			}

			filled := int(progressPercent * float64(barWidth))
			bar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)

			var statusMsg, coloredBar string
			if progress.Failed > 0 {
				coloredBar = errorStyle.Render(bar)
				statusMsg = errorStyle.Render("ERROR")
			} else if progress.Preparing > 0 {
				coloredBar = warningStyle.Render(bar)
				statusMsg = warningStyle.Render("UPDATING")
			} else if uint64(progress.Running) == targetReplicas {
				coloredBar = successStyle.Render(bar)
				statusMsg = successStyle.Render("COMPLETE")
			} else {
				coloredBar = progressStyle.Render(bar)
				statusMsg = progressStyle.Render("PROGRESS")
			}

			percentage := int(progressPercent * 100)
			status := fmt.Sprintf("%s [%s] %d%% | %s | Running: %d/%d",
				statusMsg,
				coloredBar,
				percentage,
				buildTaskStats(progress),
				progress.Running,
				targetReplicas,
			)

			if isUpdate && service.UpdateStatus != nil {
				status += fmt.Sprintf(" | Update: %s", service.UpdateStatus.State)
			}

			// Clear line and write new status
			clearLine()
			fmt.Print(status)

			allStable := uint64(progress.Running) == targetReplicas &&
				progress.Preparing == 0 &&
				progress.Failed == 0

			if allStable {
				if allRunningStableSince.IsZero() {
					allRunningStableSince = time.Now()
				}
			} else {
				allRunningStableSince = time.Time{} // Reset timer if not all running or if there are preparing/failed tasks
			}

			if isUpdateComplete(progress, targetReplicas, service, isUpdate, allRunningStableSince, stableThreshold) {
				fmt.Println()
				if progress.Failed > 0 {
					return fmt.Errorf("service update completed with %d failed tasks", progress.Failed)
				}
				return nil
			}

			if progress.Failed > 0 && progress.Running+progress.Preparing == 0 {
				fmt.Println()
				return fmt.Errorf("all tasks failed to start")
			}

			if isUpdate && service.UpdateStatus != nil {
				if service.UpdateStatus.State == swarm.UpdateStatePaused {
					fmt.Println()
					return fmt.Errorf("service update paused: %s", service.UpdateStatus.Message)
				}
				if service.UpdateStatus.State == swarm.UpdateStateRollbackCompleted {
					fmt.Println()
					return fmt.Errorf("service update rolled back: %s", service.UpdateStatus.Message)
				}
			}
		}
	}
}

func analyzeTaskProgress(tasks []swarm.Task, targetReplicas uint64) ServiceUpdateProgress {
	progress := ServiceUpdateProgress{
		Total: int(targetReplicas),
	}

	for _, task := range tasks {
		switch task.Status.State {
		case swarm.TaskStateRunning:
			progress.Running++
			if task.Status.ContainerStatus != nil && task.Status.ContainerStatus.ContainerID != "" {
				progress.Ready++
			}
		case swarm.TaskStatePreparing, swarm.TaskStateAssigned, swarm.TaskStateAccepted, swarm.TaskStateNew, swarm.TaskStateStarting:
			progress.Preparing++
		case swarm.TaskStateFailed, swarm.TaskStateRejected:
			progress.Failed++
		case swarm.TaskStateShutdown, swarm.TaskStateComplete, swarm.TaskStateOrphaned, swarm.TaskStateRemove:
			progress.Shutdown++
		}
	}

	return progress
}

func buildTaskStats(progress ServiceUpdateProgress) string {
	stats := []string{}

	if progress.Preparing > 0 {
		stats = append(stats, fmt.Sprintf("Preparing: %d", progress.Preparing))
	}
	if progress.Failed > 0 {
		stats = append(stats, fmt.Sprintf("Failed: %d", progress.Failed))
	}

	if len(stats) == 0 {
		return "All tasks ready"
	}

	return strings.Join(stats, " | ")
}

func isUpdateComplete(
	progress ServiceUpdateProgress,
	targetReplicas uint64,
	service swarm.Service,
	isUpdate bool,
	stableSince time.Time,
	stableThreshold time.Duration,
) bool {
	runningComplete := uint64(progress.Running) == targetReplicas
	noTransitional := progress.Preparing == 0
	noFailed := progress.Failed == 0

	if isUpdate && service.UpdateStatus != nil {
		if service.UpdateStatus.State == swarm.UpdateStateCompleted {
			return runningComplete && noFailed
		}

		// Fix: usar el timer externo en lugar de CompletedAt,
		// que Docker no setea en estado "updating"
		if service.UpdateStatus.State == swarm.UpdateStateUpdating &&
			runningComplete && noTransitional && noFailed &&
			!stableSince.IsZero() &&
			time.Since(stableSince) > stableThreshold {
			return true
		}

		return false
	}

	return runningComplete && noTransitional && noFailed
}

// MonitorServiceScaleWithProgressBar is a wrapper for backward compatibility
// It monitors simple scaling operations (not updates)
func MonitorServiceScaleWithProgressBar(dc *osi_types.DockerClient, serviceID string, targetReplicas uint64) error {
	return MonitorServiceUpdateWithProgressBar(dc, serviceID, targetReplicas, false)
}

// MonitorServiceRollingUpdate monitors a service rolling update with detailed progress
func MonitorServiceRollingUpdate(dc *osi_types.DockerClient, serviceID string, targetReplicas uint64) error {
	return MonitorServiceUpdateWithProgressBar(dc, serviceID, targetReplicas, true)
}

func GetSwarmServiceByName(dc *osi_types.DockerClient, serviceName string) (*swarm.Service, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	filterArgs.Add("name", serviceName)
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing services: %v", err)
	}

	if len(services) == 0 {
		return nil, fmt.Errorf("service %s not found", serviceName)
	}

	return &services[0], nil
}

// hasKnownPrefix checks if name starts with any of the known keys
func HasKnownPrefix(name string, knownKeys []string) bool {
	for _, key := range knownKeys {
		if strings.HasPrefix(name, key+"_") || name == key {
			return true
		}
	}
	return false
}


func GetAllServiceNames(pd *osi_types.PlatformData) []string {
	excluded := make(map[string]struct{}, len(pd.PlatformInfo.ExcludedServices))
	for _, name := range pd.PlatformInfo.ExcludedServices {
		excluded[name] = struct{}{}
	}

	pi := pd.PlatformInfo
	s3BucketType := pi.S3BucketType
	if s3BucketType != "Local Minio" {
		excluded["minio"] = struct{}{}
	}

	existArmArchNodes := false
	for _, node := range pi.NodesData {
		if node.NodeArch == "aarch64" {
			existArmArchNodes = true
			break
		}
	}

	if existArmArchNodes {
		excluded["grafana_renderer"] = struct{}{}
	}

	numSwarmNodes := len(pi.NodesData)
	deploymentLocation := pi.DeploymentLocation
	if numSwarmNodes <= 1 || existArmArchNodes || deploymentLocation != "On-premise cluster deployment" {
		excluded["keepalived"] = struct{}{}
	}

	deploymentMode := pi.DeploymentMode
	if deploymentMode == "production" {
		excluded["pgadmin4"] = struct{}{}
	}

	serviceNames := make([]string, 0, len(pi.ServicesData))
	for _, svcData := range pi.ServicesData {
		if _, isExcluded := excluded[svcData.ServiceName]; isExcluded {
			continue
		}

		if svcData.ServiceName == "nats" {
			for i := 1; i <= svcData.Replicas; i++ {
				serviceNames = append(serviceNames, fmt.Sprintf("nats%d", i))
			}
			continue
		}

		serviceNames = append(serviceNames, svcData.ServiceName)
	}

	return serviceNames
}

func GetDefaultServicesDataMap(pd *osi_types.PlatformData) map[string]osi_types.ServiceData {
	pi := pd.PlatformInfo
	messagingSvcCpus := strings.Split(pi.MessagingSvcResources, "-")[0]
	messagingSvcCpusFloat, _ := strconv.ParseFloat(messagingSvcCpus[0:len(messagingSvcCpus)-3], 64)
	messagingSvcCpus_025 := fmt.Sprintf("%.2fCPU", 0.25*messagingSvcCpusFloat)
	iotStorageDataSvcCpus := strings.Split(pi.IotDataStorageSvcResources, "-")[0]
	adminDataStorageSvcCpus := strings.Split(pi.AdminDataStorageSvcResources, "-")[0]
	uiSvcCpus := strings.Split(pi.UiSvcResources, "-")[0]
	uiSvcCpusFloat, _ := strconv.ParseFloat(uiSvcCpus[0:len(uiSvcCpus)-3], 64)
	uiSvcCpus_050 := fmt.Sprintf("%.2fCPU", 0.50*uiSvcCpusFloat)
	pipelinesSvcCpus := strings.Split(pi.PipelinesSvcResources, "-")[0]

	messagingSvcMem := strings.Split(pi.MessagingSvcResources, "-")[1]
	messagingSvcMemFloat, _ := strconv.ParseFloat(messagingSvcMem[0:len(messagingSvcMem)-2], 64)
	messagingSvcMem_025 := fmt.Sprintf("%.2fMb", 0.25*messagingSvcMemFloat)
	iotDataStorageSvcMem := strings.Split(pi.IotDataStorageSvcResources, "-")[1]

	adminDataStorageSvcMem := strings.Split(pi.AdminDataStorageSvcResources, "-")[1]
	uiSvcMem := strings.Split(pi.UiSvcResources, "-")[1]
	uiSvcMemFloat, _ := strconv.ParseFloat(uiSvcMem[0:len(uiSvcMem)-2], 64)
	uiSvcMem_050 := fmt.Sprintf("%.2fMb", 0.50*uiSvcMemFloat)
	pipelinesSvcMem := strings.Split(pi.PipelinesSvcResources, "-")[1]
	defaultNumNatsReplicas := Max(pi.DefaultNumOfNatsReplicas, 1)

	defaultServicesDataMap := map[string]osi_types.ServiceData{
		"admin_api": {
			ServiceName: "admin_api",
			Image: "ghcr.io/osi4iot/admin_api_nats:1.3.0",
			Replicas:    1,
			Cpu:         uiSvcCpus,
			Memory:      uiSvcMem,
		},
		"frontend": {
			ServiceName: "frontend",
			Image: "ghcr.io/osi4iot/frontend_nats:1.3.0",
			Replicas:    1,
			Cpu:         uiSvcCpus,
			Memory:      uiSvcMem,
		},
		"nats": {
			ServiceName: "nats",
			Image: "ghcr.io/osi4iot/nats:2.11.1-alpine",
			Replicas:    defaultNumNatsReplicas,
			Cpu:         messagingSvcCpus,
			Memory:      messagingSvcMem,
		},
		"auth_callout": {
			ServiceName: "auth_callout",
			Image: "ghcr.io/osi4iot/auth_callout:1.3.0",
			Replicas:    1,
			Cpu:         messagingSvcCpus_025,
			Memory:      messagingSvcMem_025,
		},
		"grafana": {
			ServiceName: "grafana",
			Image: "ghcr.io/osi4iot/grafana:8.4.1-ubuntu",
			Replicas:    1,
			Cpu:         uiSvcCpus,
			Memory:      uiSvcMem,
		},
		"pipelines": {
			ServiceName: "pipelines",
			Image: "ghcr.io/osi4iot/pipelines:1.3.0",
			Replicas:    pi.DefaultNumPipelinesInstances,
			Cpu:         pipelinesSvcCpus,
			Memory:      pipelinesSvcMem,
		},
		"traefik": {
			ServiceName: "traefik",
			Image: "ghcr.io/osi4iot/traefik_go_cli:v3.6",
			Replicas:    1,
			Cpu:         uiSvcCpus,
			Memory:      uiSvcMem,
		},
		"system-prune": {
			ServiceName: "system-prune",
			Image: "ghcr.io/osi4iot/system_prune:latest",
			Replicas:    1,
			Cpu:         "0.125CPU",
			Memory:      "100Mb",
		},
		"postgres": {
			ServiceName: "postgres",
			Image: "ghcr.io/osi4iot/postgres:14.6-alpine",
			Replicas:    1,
			Cpu:         adminDataStorageSvcCpus,
			Memory:      adminDataStorageSvcMem,
		},
		"timescaledb": {
			ServiceName: "timescaledb",
			Image: "ghcr.io/osi4iot/patroni:2.27.0-pg18",
			Replicas:    1,
			Cpu:         iotStorageDataSvcCpus,
			Memory:      iotDataStorageSvcMem,
		},
		"pgadmin4": {
			ServiceName: "pgadmin4",
			Image: "ghcr.io/osi4iot/pgadmin4:2023-10-18-2",
			Replicas:    1,
			Cpu:         uiSvcCpus_050,
			Memory:      uiSvcMem_050,
		},
		"grafana_renderer": {
			ServiceName: "grafana_renderer",
			Image: "ghcr.io/osi4iot/grafana_renderer:3.12.0",
			Replicas:    1,
			Cpu:         uiSvcCpus_050,
			Memory:      uiSvcMem_050,
		},
		"minio": {
			ServiceName: "minio",
			Image: "ghcr.io/osi4iot/minio:RELEASE.2023-10-16T04-13-43Z",
			Replicas:    1,
			Cpu:         adminDataStorageSvcCpus,
			Memory:      iotDataStorageSvcMem,
		},
		"keepalived": {
			ServiceName: "keepalived",
			Image: "ghcr.io/osi4iot/keepalived:latest",
			Replicas:    1,
			Cpu:         "0.25CPU",
			Memory:      "250Mb",
		},
	}
	return defaultServicesDataMap

}