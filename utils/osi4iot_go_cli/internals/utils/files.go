package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

var osi4iotStateFile = "osi4iot_state.json"


func ExistFile(filePath string) bool {
    _, err := os.Stat(filePath)
    return err == nil
}

func CreateDirectoryIfNotExists(dirPath string) error {
	if _, err := os.Stat(dirPath); os.IsNotExist(err) {
		err := os.MkdirAll(dirPath, os.ModePerm)
		if err != nil {
			return err
		}
	}
	return nil
}

func GetStateFilePath() string {
    abs, err := filepath.Abs(osi4iotStateFile)
    if err != nil {
        return osi4iotStateFile
    }
    return abs
}

func ExistStateFile() bool {
    return ExistFile(GetStateFilePath())
}

func WritePlatformDataToFile(data *pt.PlatformData) error {
	plaintext, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("error serializing platform data: %w", err)
	}

	result, err := crypto.GetPassphrase(nil)
	if err != nil {
		return fmt.Errorf("error getting passphrase: %w", err)
	}

	encoded, err := crypto.Encrypt(plaintext, result.Value)
	if err != nil {
		return fmt.Errorf("error encrypting state file: %w", err)
	}

	if err := os.WriteFile(osi4iotStateFile, encoded, 0600); err != nil {
		return err
	}
	ChownToInvokingUserQuietly(osi4iotStateFile)

	// Every change to the state file is a change worth having an
	// off-host copy of — see SetStateBackupHook.
	runStateBackupHook(data, plaintext, encoded)
	return nil
}

func ReadPlatformDataFromFile(data *pt.PlatformData) error {
	existFile := ExistStateFile()
	if !existFile {
		return nil
	}

	encoded, err := os.ReadFile(osi4iotStateFile)
	if err != nil {
		return err
	}

	result, err := crypto.GetPassphrase(encoded)
	if err != nil {
		return fmt.Errorf("error getting passphrase: %w", err)
	}

	plaintext, err := crypto.Decrypt(encoded, result.Value)
	if err != nil {
		return fmt.Errorf("error decrypting state file: %w", err)
	}

	if err := json.Unmarshal(plaintext, data); err != nil {
		return err
	}

	return fixingPlatformData(data)
}

func fixingPlatformData(pd *pt.PlatformData) error {
	nodesData := pd.PlatformInfo.NodesData
	for nodeIdx, node := range nodesData {
		if node.NodeIP == "localhost" {
			nodeIP, err := GetLocalNodeIP()
			if err != nil {
				return fmt.Errorf("error getting local node IP: %v", err)
			}
			nodesData[nodeIdx].NodeIP = nodeIP
		}
	}

	servicesList := []string{
		"system_manager",
		"admin_api",
		"frontend",
		"nats",
		"auth_callout",
		"grafana",
		"pipelines",
		"traefik",
		"pgadmin4",
		"grafana_renderer",
		"minio",
		"keepalived",
	}

	if pd.PlatformInfo.UsePatroniTool {
		servicesList = append(servicesList, "haproxy_patroni")
				
		numPatroniAdminNodes := Max(pd.PlatformInfo.NumPatroniAdminNodes, 1)
		for i := 1; i <= numPatroniAdminNodes; i++ {
			name := fmt.Sprintf("patroni_admin%d", i)
			servicesList = append(servicesList, name)
		}

		numPatroniMetricsNodes := Max(pd.PlatformInfo.NumPatroniMetricsNodes, 1)
		for i := 1; i <= numPatroniMetricsNodes; i++ {
			name := fmt.Sprintf("patroni_metrics%d", i)
			servicesList = append(servicesList, name)
		}
	} else {
		servicesList = append(servicesList, "postgres", "timescaledb")
	}

	defaultServicesDataMap := GetDefaultServicesDataMap(pd)

	servicesData := pd.PlatformInfo.ServicesData
	if len(servicesData) == 0 {
		var defaultServicesData []pt.ServiceData
		for _, svcName := range servicesList {
			defaultServicesData = append(defaultServicesData, defaultServicesDataMap[svcName])
		}
		servicesData = defaultServicesData
	} else {
		for serviceName, defaultSvcData := range defaultServicesDataMap {
			found := false
			for _, svcData := range servicesData {
				if svcData.ServiceName == serviceName {
					found = true
					break
				}
			}
			if !found {
				servicesData = append(servicesData, defaultSvcData)
			}
		}

		for svcIdx, svc := range servicesData {
			serviceName := svc.ServiceName
			if svc.Image == "" {
				servicesData[svcIdx].Image = defaultServicesDataMap[serviceName].Image
			}
			if svc.Replicas < 1 {
				servicesData[svcIdx].Replicas = defaultServicesDataMap[serviceName].Replicas
			}
			if svc.Cpu == "" {
				servicesData[svcIdx].Cpu = defaultServicesDataMap[serviceName].Cpu
			}
			if svc.Memory == "" {
				servicesData[svcIdx].Memory = defaultServicesDataMap[serviceName].Memory
			}
		}
	}

	pd.PlatformInfo.ServicesData = servicesData
	return nil
}

func ExportUnencrypted(passphrase []byte) error {
	encoded, err := os.ReadFile(osi4iotStateFile)
	if err != nil {
		return fmt.Errorf("error reading state file: %w", err)
	}

	plaintext, err := crypto.DecryptWithPassphrase(encoded, passphrase)
	if err != nil {
		return fmt.Errorf("wrong passphrase or corrupted file: %w", err)
	}

	// Pretty print del JSON
	var prettyBuf bytes.Buffer
	if err := json.Indent(&prettyBuf, plaintext, "", "  "); err != nil {
		return fmt.Errorf("error formatting JSON: %w", err)
	}

	outputFile := "osi4iot_state_unencrypted.json"
	if err := os.WriteFile(outputFile, prettyBuf.Bytes(), 0600); err != nil {
		return fmt.Errorf("error writing output file: %w", err)
	}

	return nil
}

// ChownToInvokingUser gives a file back to the user who ran sudo.
//
// A no-op when not running as root, when sudo did not set SUDO_UID and
// SUDO_GID, or when root ran the command directly — in that last case
// root IS the invoking user and there is nobody else to hand it to.
//
// Directories are handled the same way, so a ~/.osi4iot created by a
// root-run command does not lock the operator out of it afterwards.
func ChownToInvokingUser(path string) error {
	if os.Geteuid() != 0 {
		return nil
	}
 
	uidText, gidText := os.Getenv("SUDO_UID"), os.Getenv("SUDO_GID")
	if uidText == "" || gidText == "" {
		return nil
	}
 
	uid, err := strconv.Atoi(uidText)
	if err != nil {
		return fmt.Errorf("SUDO_UID is %q, which is not a user id", uidText)
	}
	gid, err := strconv.Atoi(gidText)
	if err != nil {
		return fmt.Errorf("SUDO_GID is %q, which is not a group id", gidText)
	}
	if uid == 0 {
		return nil
	}
 
	if err := os.Chown(path, uid, gid); err != nil {
		return fmt.Errorf("error giving %s back to uid %d: %w", path, uid, err)
	}
	return nil
}
 
// ChownToInvokingUserQuietly is ChownToInvokingUser for the call sites
// where failing would be worse than the problem.
//
// A state file that was written correctly but could not be chowned is
// still a state file: the operator can fix it with one chown, and
// aborting the command that just deployed a platform over it would be
// out of proportion. The warning is printed so it does not pass
// unnoticed.
func ChownToInvokingUserQuietly(path string) {
	if err := ChownToInvokingUser(path); err != nil {
		fmt.Println(StyleWarningMsg.Render(fmt.Sprintf(
			"Warning: %v\n  Commands that do not run under sudo will not be able to read it. "+
				"Fix it with: sudo chown $USER %s", err, path)))
	}
}
 