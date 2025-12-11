package utils

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/lipgloss"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/swarm"
	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

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

func InspectService(pd *osi_types.PlatformData, service swarm.Service, networks []network.Summary) error {
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

func MonitorServiceScaleWithProgressBar(dc *osi_types.DockerClient, serviceID string, targetReplicas uint64) error {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	timeout := time.After(5 * time.Minute)

	progressStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("34"))

	barWidth := 30
	fmt.Println()
	ctx := context.Background()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for service to scale")
		case <-ticker.C:
			taskFilters := filters.NewArgs()
			taskFilters.Add("service", serviceID)
			taskFilters.Add("desired-state", "running")

			tasks, err := dc.Cli.TaskList(ctx, types.TaskListOptions{
				Filters: taskFilters,
			})
			if err != nil {
				return fmt.Errorf("failed to list tasks: %w", err)
			}

			var running, preparing, failed int
			for _, task := range tasks {
				switch task.Status.State {
				case swarm.TaskStateRunning:
					running++
				case swarm.TaskStatePreparing, swarm.TaskStateAssigned, swarm.TaskStateAccepted, swarm.TaskStateNew:
					preparing++
				case swarm.TaskStateFailed, swarm.TaskStateRejected:
					failed++
				}
			}

			// Calcular progreso
			progress := float64(running) / float64(targetReplicas)
			if progress > 1.0 {
				progress = 1.0
			}

			// Crear barra de progreso
			filled := int(progress * float64(barWidth))
			bar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)

			// Mostrar progreso
			percentage := int(progress * 100)
			status := fmt.Sprintf("\r%s [%s] %d%% | Running: %d/%d | Preparing: %d | Failed: %d",
				progressStyle.Render("Progress:"),
				progressStyle.Render(bar),
				percentage,
				running,
				targetReplicas,
				preparing,
				failed,
			)

			fmt.Print(status)

			// Verificar si hemos terminado
			if uint64(running) == targetReplicas && preparing == 0 {
				fmt.Println()
				return nil
			}

			if failed > 0 && running+preparing == 0 {
				fmt.Println()
				return fmt.Errorf("all tasks failed to start")
			}
		}
	}
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
