package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

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

	return os.WriteFile(osi4iotStateFile, encoded, 0600)
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
		"admin_api",
		"frontend",
		"nats",
		"auth_callout",
		"grafana",
		"pipelines",
		"traefik",
		"system-prune",
		"postgres",
		"timescaledb",
		"pgadmin4",
		"grafana_renderer",
		"minio",
		"keepalived",
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