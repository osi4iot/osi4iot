package data

import (
	"encoding/json"
	"io"
	"os"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

var osi4iotStateFile = "osi4iot_state.json"

func ExistFile(filePath string) bool {
	existFile := false
	_, err := os.Stat(filePath)
	if err == nil {
		existFile = true
	} else {
		if os.IsNotExist(err) {
			existFile = false
		}
	}
	return existFile
}

func ExistStateFile() bool {
	return ExistFile(osi4iotStateFile)
}

func WritePlatformDataToFile() error {
	file, _ := json.Marshal(Data)
	err := os.WriteFile(osi4iotStateFile, file, 0644)
	if err != nil {
		return err
	}
	return nil
}

func ReadPlatformDataFromFile() error {
	existFile := ExistStateFile()
	if existFile {
		jsonFile, err := os.Open(osi4iotStateFile)
		if err != nil {
			return err
		}
		defer jsonFile.Close()

		byteValue, _ := io.ReadAll(jsonFile)
		err = json.Unmarshal(byteValue, &Data)
		if err != nil {
			return err
		}
	}

	err := CreateGeoJsonFiles()
	if err != nil {
		return err
	}

	err = CreateDomainCertsFiles()
	if err != nil {
		return err
	}

	err = CreateSSHKeysFile()
	if err != nil {
	   return err
	}

	return nil
}

func CreateGeoJsonFiles() error {
	mainOrgBuildingPath := Data.PlatformInfo.MainOrganizationBuildingPath
	mainOrgBuildingData := Data.PlatformInfo.MainOrganizationBuilding
	if mainOrgBuildingPath != "" && mainOrgBuildingData != "" && !ExistFile(mainOrgBuildingPath) {
		err := utils.WriteToFile(mainOrgBuildingPath, []byte(mainOrgBuildingData), 0644)
		if err != nil {
			return err
		}
	}

	mainOrgFirstFloorPath := Data.PlatformInfo.MainOrganizationFirstFloorPath
	mainOrgFirstFloorData := Data.PlatformInfo.MainOrganizationFirstFloor
	if mainOrgFirstFloorPath != "" && mainOrgFirstFloorData != "" && !ExistFile(mainOrgFirstFloorPath) {
		err := utils.WriteToFile(mainOrgFirstFloorPath, []byte(mainOrgFirstFloorData), 0644)
		if err != nil {
			return err
		}
	}
	return nil
}

func CreateDomainCertsFiles() error {
	if Data.PlatformInfo.DomainCertsType == "Certs provided by an CA" {
		privateKeyPath := Data.PlatformInfo.DOMAIN_SSL_PRIVATE_KEY_PATH
		privateKey := Data.Certs.DomainCerts.PrivateKey
		if privateKeyPath != "" && privateKey != "" && !ExistFile(privateKeyPath) {
			err := utils.WriteToFile(privateKeyPath, []byte(privateKey), 0644)
			if err != nil {
				return err
			}
		}

		caPemPath := Data.PlatformInfo.DOMAIN_SSL_CA_PEM_PATH
		caPem := Data.Certs.DomainCerts.SslCaPem
		if caPemPath != "" && caPem != "" && !ExistFile(caPemPath) {
			err := utils.WriteToFile(caPemPath, []byte(caPem), 0644)
			if err != nil {
				return err
			}
		}

		certPath := Data.PlatformInfo.DOMAIN_SSL_CERT_CRT_PATH
		cert := Data.Certs.DomainCerts.SslCertCrt
		if certPath != "" && cert != "" && !ExistFile(certPath) {
			err := utils.WriteToFile(certPath, []byte(cert), 0644)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func CreateSSHKeysFile() error {
	awsKeyPath := Data.PlatformInfo.AwsSshKeyPath
	awsKey := Data.PlatformInfo.AwsSshKey
	if awsKeyPath != "" && awsKey != "" && !ExistFile(awsKeyPath) {
		err := utils.WriteToFile(awsKeyPath, []byte(awsKey), 0644)
		if err != nil {
			return err
		}
	}

	sshPrivKeyPath := Data.PlatformInfo.SshPrivKeyPath
	sshPrivKey := Data.PlatformInfo.SshPrivKey
	if sshPrivKeyPath != "" && sshPrivKey != "" && !ExistFile(sshPrivKeyPath) {
		err := utils.WriteToFile(sshPrivKeyPath, []byte(sshPrivKey), 0644)
		if err != nil {
			return err
		}
	}

	sshPubKeyPath := Data.PlatformInfo.SshPubKeyPath
	sshPubKey := Data.PlatformInfo.SshPubKey
	if sshPubKeyPath != "" && sshPubKey != "" && !ExistFile(sshPubKeyPath) {
		err := utils.WriteToFile(sshPubKeyPath, []byte(sshPubKey), 0644)
		if err != nil {
			return err
		}
	}

	return nil
}
