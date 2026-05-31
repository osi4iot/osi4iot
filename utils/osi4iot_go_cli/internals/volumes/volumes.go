package volumes

import (
	"context"
	"fmt"
	"strings"

	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/errdefs"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
)

type EBSVolumeOptions struct {
	size       string
	volumeType string
	iops       string
	throughput string
	encrypted  string
}

var DefaultEBSVolumeVolumeOptions = EBSVolumeOptions{
	size:       "20",
	volumeType: "gp3",
	iops:       "3000",
	throughput: "125",
	encrypted:  "true",
}

type VolumeOptions struct {
	driverOptsO string
	ebsOpts     EBSVolumeOptions
}

type EBSVolumeInfo struct {
	VolumeID   string
	State      string
	Size       int32
	VolumeType string
	AZ         string
	Encrypted  bool
	Tags       map[string]string
}

func createDefaultOptions(pi pt.PlatformInfo) VolumeOptions {
	deploymentLocation := pi.DeploymentLocation
	driverOptsO := ""
	nodesData := pi.NodesData
	ebsOpts := EBSVolumeOptions{}
	if pi.UseRexRayPlugin {
		ebsOpts = DefaultEBSVolumeVolumeOptions
	}
	if deploymentLocation == "On-premise cluster deployment" && len(nodesData) > 1 {
		nfsServerIP := ""
		for _, node := range nodesData {
			if node.NodeRole == "NFS Server" {
				nfsServerIP = node.NodeIP
				break
			}
		}
		driverOptsO = fmt.Sprintf("nfsvers=4,addr=%s,rw", nfsServerIP)
	}
	volOptions := VolumeOptions{
		driverOptsO: driverOptsO,
		ebsOpts:     ebsOpts,
	}
	return volOptions
}

func GenerateVolumes(platformData *pt.PlatformData) map[string]pt.Volume {
	Volumes := make(map[string]pt.Volume)
	pi := platformData.PlatformInfo

	deploymentLocation := pi.DeploymentLocation
	deploymentMode := pi.DeploymentMode
	s3BucketType := pi.S3BucketType
	domainCertsType := pi.DomainCertsType

	volOptions := createDefaultOptions(pi)
	if domainCertsType[0:19] == "Let's encrypt certs" {
		Volumes["letsencrypt"] = SetVolumeConfig(pi, "letsencrypt", "global", deploymentLocation, volOptions)
	}

	numNatsReplicas := utils.GetServiceReplicas(platformData, "nats")
	for replica := 1; replica <= numNatsReplicas; replica++ {
		volumeName := fmt.Sprintf("nats%d_data", replica)
		serviceName := fmt.Sprintf("nats%d", replica)
		Volumes[volumeName] = SetVolumeConfig(pi, volumeName, serviceName, deploymentLocation, volOptions)
	}

	Volumes["pgdata"] = SetVolumeConfig(pi, "pgdata", "postgres", deploymentLocation, volOptions)
	Volumes["grafana_data"] = SetVolumeConfig(pi, "grafana_data", "grafana", deploymentLocation, volOptions)
	Volumes["timescaledb_data"] = SetVolumeConfig(pi, "timescaledb_data", "timescaledb", deploymentLocation, volOptions)
	Volumes["timescaledb_wal"] = SetVolumeConfig(pi, "timescaledb_wal", "timescaledb", deploymentLocation, volOptions)
	Volumes["vector_buffer"] = SetVolumeConfig(pi, "vector_buffer", "vector", deploymentLocation, volOptions)

	numPipelinesReplicas := utils.GetServiceReplicas(platformData, "pipelines")
	for i := 1; i <= numPipelinesReplicas; i++ {
		volName := fmt.Sprintf("pipelines_data_%d", i)
		Volumes[volName] = SetVolumeConfig(pi, volName, "pipelines", deploymentLocation, volOptions)
	}

	if deploymentMode == "development" {
		Volumes["pgadmin4_data"] = SetVolumeConfig(pi, "pgadmin4_data", "pgadmin4", deploymentLocation, volOptions)
	}

	if s3BucketType == "Local Minio" {
		Volumes["minio_storage"] = SetVolumeConfig(pi, "minio_storage", "minio", deploymentLocation, volOptions)
		Volumes["minio_data"] = SetVolumeConfig(pi, "minio_data", "minio", deploymentLocation, volOptions)
	}

	return Volumes
}

func CreateVolume(dc *pt.DockerClient, domainName string, swarmVol *pt.Volume) error {
	existingVolumes, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing volumes: %v", err)
	}

	volumeExists := false
	for _, v := range existingVolumes.Volumes {
		if v.Name == swarmVol.Name {
			swarmVol.ID = v.Name
			volumeExists = true
			break
		}
	}

	if !volumeExists {
		driverOpts := swarmVol.DriverOpts
		if driverOpts == nil {
			driverOpts = map[string]string{}
		}

		driverOpts["tags"] = fmt.Sprintf("app=osi4iot,service=%s,domainName=%s",
			swarmVol.ServiceName,
			domainName,
		)

		vol, err := dc.Cli.VolumeCreate(dc.Ctx, volume.CreateOptions{
			Name:       swarmVol.Name,
			Driver:     swarmVol.Driver,
			DriverOpts: driverOpts,
			Labels: map[string]string{
				"app":        "osi4iot",
				"service":    swarmVol.ServiceName,
				"domainName": domainName,
			},
		})
		if err != nil {
			return fmt.Errorf("error creating volume: %v", err)
		}
		swarmVol.ID = vol.Name
	}

	return nil
}

func CreateSwarmVolumes(pd *pt.PlatformData, volumesMap map[string]pt.Volume) (map[string]pt.Volume, error) {
	numNodes := len(pd.PlatformInfo.NodesData)
	domainName := pd.PlatformInfo.DomainName
	errors := []error{}
	for _, dc := range pt.DCMap {
		var filteredVolumes map[string]pt.Volume
		if numNodes == 1 {
			filteredVolumes = volumesMap
		} else {
			filteredVolumes = getVolumesMapByNodeRole(volumesMap, dc.Node.NodeRole, pd)
		}

		for key, volume := range filteredVolumes {
			err := CreateVolume(dc, domainName, &volume)
			if err != nil {
				errors = append(errors, fmt.Errorf("error creating volume %s in node %s: %v", volume.Name, dc.Node.NodeIP, err))
			}
			volumesMap[key] = volume
		}
	}

	if len(errors) > 0 {
		return nil, fmt.Errorf("errors creating volumes: %v", errors)
	}

	return volumesMap, nil
}

func RemoveSwarmVolumes(pd *pt.PlatformData) error {
	errors := []error{}
	filterByNames := getVolumeFilterByNames(pd)

	for _, dc := range pt.DCMap {
		existingVolumes := make(map[string]*volume.Volume)
		volumesByNameResp, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{
			Filters: filterByNames,
		})
		if err != nil {
			return fmt.Errorf("error listing volumes by name: %v", err)
		}
		for _, v := range volumesByNameResp.Volumes {
			existingVolumes[v.Name] = v
		}

		filterByLabel := filters.NewArgs()
		filterByLabel.Add("label", "app=osi4iot")
		volumesByLabelResp, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{
			Filters: filterByLabel,
		})
		if err != nil {
			return fmt.Errorf("error listing volumes by label: %v", err)
		}
		for _, v := range volumesByLabelResp.Volumes {
			if _, ok := existingVolumes[v.Name]; !ok {
				existingVolumes[v.Name] = v
			}
		}

		for _, v := range existingVolumes {
			fmt.Printf("XXXXXXXXXXX Nombre: %s\n", v.Name)
			fmt.Printf("XXXXXXXXXXX Driver: %s\n", v.Driver)
			fmt.Printf("XXXXXXXXXXX Mountpoint: %s\n", v.Mountpoint)
			fmt.Printf("XXXXXXXXXXX Status: %+v\n", v.Status)
			fmt.Printf("XXXXXXXXXXX Labels: %+v\n", v.Labels)
			fmt.Println("XXXXXXXXXXX ---")

			err = dc.Cli.VolumeRemove(dc.Ctx, v.Name, true)
			if err != nil {
				fmt.Printf("XXXXXXXXXXX Error VolumeRemove: %v\n", err)
				if errdefs.IsNotFound(err) {
					continue
				}
				if strings.Contains(err.Error(), "already been removed") {
					continue
				}
				errors = append(errors, fmt.Errorf("error removing volume: %v", err))
			} else {
				fmt.Printf("XXXXXXXXXXXX VolumeRemove ejecutado sin error para: %s\n", v.Name)
			}
		}

	}

	if len(errors) > 0 {
		return fmt.Errorf("errors removing volumes: %v", errors)
	}

	return nil
}

func getVolumeFilterByNames(pd *pt.PlatformData) filters.Args {
	volumeNames := []string{
		"letsencrypt",
		"pgdata",
		"grafana_data",
		"timescaledb_data",
		"pgadmin4_data",
		"minio_storage",
		"vector_buffer",
	}
	numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
	for replica := 1; replica <= numNatsReplicas; replica++ {
		volName := fmt.Sprintf("nats%d_data", replica)
		volumeNames = append(volumeNames, volName)
	}

	volumeFilters := filters.NewArgs()
	for _, name := range volumeNames {
		volumeFilters.Add("name", name)
	}

	return volumeFilters
}

func getVolumesMapByNodeRole(volumesMap map[string]pt.Volume, nodeRole string, pd *pt.PlatformData) map[string]pt.Volume {
	volumeNames := []string{}
	switch nodeRole {
	case "Manager":
		volumeNames = append(volumeNames,
			"letsencrypt",
			"grafana_data",
		)
	case "Platform worker":
		volumeNames = append(volumeNames,
			"pgdata",
			"timescaledb_data",
			"pgadmin4_data",
			"minio_storage",
		)
		numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
		for replica := 1; replica <= numNatsReplicas; replica++ {
			volName := fmt.Sprintf("nats%d_data", replica)
			volumeNames = append(volumeNames, volName)
		}

	case "NfsWorker":
		//no code
	}

	filteredVolumes := make(map[string]pt.Volume)
	for _, name := range volumeNames {
		filteredVolumes[name] = volumesMap[name]
	}

	return filteredVolumes
}

func SetVolumeConfig(pi pt.PlatformInfo, volumeName string, serviceName string, deploymentLocation string, volOpts VolumeOptions) pt.Volume {
	vol := pt.Volume{
		Name:        volumeName,
		ServiceName: serviceName,
		Driver:      "local",
		DriverOpts:  map[string]string{},
	}
	switch deploymentLocation {
	case "Local deployment":
		if pi.UseRexRayPlugin {
			vol.Driver = "rexray-ebs"
			vol.DriverOpts = map[string]string{
				"size":       volOpts.ebsOpts.size,
				"volumeType": volOpts.ebsOpts.volumeType,
				"iops":       volOpts.ebsOpts.iops,
				"throughput": volOpts.ebsOpts.throughput,
				"encrypted":  volOpts.ebsOpts.encrypted,
			}
		}
	case "On-premise cluster deployment":
		vol.Driver = "nfs"
		vol.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      volOpts.driverOptsO,
			"device": fmt.Sprintf(":/var/nfs_osi4iot/%s", volumeName),
		}
	case "AWS cluster deployment":
		vol.Driver = "rexray-ebs"
		vol.DriverOpts = map[string]string{
			"size":       volOpts.ebsOpts.size,
			"volumeType": volOpts.ebsOpts.volumeType,
			"iops":       volOpts.ebsOpts.iops,
			"throughput": volOpts.ebsOpts.throughput,
			"encrypted":  volOpts.ebsOpts.encrypted,
		}
	}

	return vol
}

func CreateNatsVolume(pi pt.PlatformInfo, dc *pt.DockerClient, replica int) (*pt.Volume, error) {
	volOptions := createDefaultOptions(pi)
	volumeName := fmt.Sprintf("nats%d_data", replica)
	serviceName := fmt.Sprintf("nats%d", replica)
	domainName := pi.DomainName
	volume := SetVolumeConfig(pi, volumeName, serviceName, pi.DeploymentLocation, volOptions)
	err := CreateVolume(dc, domainName, &volume)
	if err != nil {
		return nil, fmt.Errorf("error creating volume %s in node %s: %v", volume.Name, dc.Node.NodeIP, err)
	}

	return &volume, nil
}

func RemoveNatsVolume(dc *pt.DockerClient, replica int) error {
	volumeName := fmt.Sprintf("nats%d_data", replica)
	err := dc.Cli.VolumeRemove(dc.Ctx, volumeName, true)
	if err != nil {
		if errdefs.IsNotFound(err) {
			return nil
		}
		return fmt.Errorf("error removing volume: %v", err)
	}
	return nil
}

func CreatePipelinesVolume(pi pt.PlatformInfo, dc *pt.DockerClient, replica int) error {
	volOptions := createDefaultOptions(pi)
	volumeName := fmt.Sprintf("pipelines_data_%d", replica)
	domainName := pi.DomainName
	volume := SetVolumeConfig(pi, volumeName, "pipelines", pi.DeploymentLocation, volOptions)
	err := CreateVolume(dc, domainName, &volume)
	if err != nil {
		return fmt.Errorf("error creating volume %s in node %s: %v", volume.Name, dc.Node.NodeIP, err)
	}

	return nil
}

func RemovePipelinesVolume(dc *pt.DockerClient, replica int) error {
	volumeName := fmt.Sprintf("pipelines_data_%d", replica)
	err := dc.Cli.VolumeRemove(dc.Ctx, volumeName, true)
	if err != nil {
		if errdefs.IsNotFound(err) {
			return nil
		}
		return fmt.Errorf("error removing volume: %v", err)
	}
	return nil
}

func ListEBSVolumes(ctx context.Context, filters ...ec2types.Filter) ([]EBSVolumeInfo, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("error loading AWS config: %w", err)
	}
	ec2Client := ec2.NewFromConfig(cfg)

	input := &ec2.DescribeVolumesInput{}
	if len(filters) > 0 {
		input.Filters = filters
	}

	var volumes []EBSVolumeInfo

	paginator := ec2.NewDescribeVolumesPaginator(ec2Client, input)
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("error describing EBS volumes: %w", err)
		}

		for _, v := range page.Volumes {
			tags := make(map[string]string)
			for _, tag := range v.Tags {
				tags[aws.ToString(tag.Key)] = aws.ToString(tag.Value)
			}

			volumes = append(volumes, EBSVolumeInfo{
				VolumeID:   aws.ToString(v.VolumeId),
				State:      string(v.State),
				Size:       aws.ToInt32(v.Size),
				VolumeType: string(v.VolumeType),
				AZ:         aws.ToString(v.AvailabilityZone),
				Encrypted:  aws.ToBool(v.Encrypted),
				Tags:       tags,
			})
		}
	}

	return volumes, nil
}

func ListOsi4iotEBSVolumes(ctx context.Context, domainName string) ([]EBSVolumeInfo, error) {
	return ListEBSVolumes(ctx,
		ec2types.Filter{
			Name:   aws.String("tag:app"),
			Values: []string{"osi4iot"},
		},
		ec2types.Filter{
			Name:   aws.String("tag:domainName"),
			Values: []string{domainName},
		},
	)
}

func ListEBSVolumesByState(ctx context.Context, states ...string) ([]EBSVolumeInfo, error) {
	return ListEBSVolumes(ctx,
		ec2types.Filter{
			Name:   aws.String("status"),
			Values: states,
		},
	)
}

func GetNumVolumes(pd *pt.PlatformData) (int, error) {
	pi := pd.PlatformInfo
	domainName := pi.DomainName
	useRexRay := pi.UseRexRayPlugin
	numVolumes := 0
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	filterArgs.Add("label", fmt.Sprintf("domainName=%s", domainName))

	if useRexRay {
		volumes, err := ListOsi4iotEBSVolumes(context.Background(), domainName)
		if err != nil {
			return 0, fmt.Errorf("error listing EBS volumes: %w", err)
		}
		numVolumes = len(volumes)
	} else {
		for _, dc := range pt.DCMap {
			existingVolumes, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{
				Filters: filterArgs,
			})
			if err != nil {
				return 0, fmt.Errorf("error listing volumes: %v", err)
			}
			numVolumes += len(existingVolumes.Volumes)
		}
	}

	return numVolumes, nil
}
