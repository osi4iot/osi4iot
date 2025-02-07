package tools

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"golang.org/x/crypto/ssh"
)

func configWithPassword(user, password string) *ssh.ClientConfig {
	return &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
}

func SshConfigWithKey(user, privateKey string) *ssh.ClientConfig {
	return &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeysCallback(func() ([]ssh.Signer, error) {
				signer, err := privateKeySigner(privateKey)
				if err != nil {
					return nil, err
				}
				return []ssh.Signer{signer}, nil
			}),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
}

func privateKeySigner(privateKey string) (ssh.Signer, error) {
	signer, err := ssh.ParsePrivateKey([]byte(privateKey))
	if err != nil {
		return nil, err
	}
	return signer, nil
}

func PublicKeyFile(file string) ssh.AuthMethod {
	buffer, err := os.ReadFile(file)
	if err != nil {
		return nil
	}

	key, err := ssh.ParsePrivateKey(buffer)
	if err != nil {
		return nil
	}
	return ssh.PublicKeys(key)
}

func giveSshPrivateKeyPath(platformData *common.PlatformData) string {
	sshPrivateKeyPath := platformData.PlatformInfo.SshPrivKeyPath
	if sshPrivateKeyPath == "" {
		sshPrivateKeyPath = "./.osi4iot_keys/osi4iot_key"
	}

	return sshPrivateKeyPath
}

func giveSshPublicKeyPath(platformData *common.PlatformData) string {
	sshPublicKey := platformData.PlatformInfo.SshPubKeyPath
	if sshPublicKey == "" {
		sshPublicKey = "./.osi4iot_keys/osi4iot_key.pub"
	}

	return sshPublicKey
}

func CreateKeyPair(platformData *common.PlatformData) error {
	if platformData.PlatformInfo.SshPrivKey == "" && platformData.PlatformInfo.SshPubKey == "" {
		sshPrivateKeyPath := giveSshPrivateKeyPath(platformData)
		existsSshPrivateKeyFile := utils.FileExists(sshPrivateKeyPath)
		sshPublicKeyPath := giveSshPublicKeyPath(platformData)
		existsSshPublicKeyFile := utils.FileExists(sshPublicKeyPath)
		if existsSshPrivateKeyFile && existsSshPublicKeyFile {
			sshPrivKey, err := readSshPrivateKeyFromFile(platformData)
			if err != nil {
				return fmt.Errorf("error reading SSH private key from file: %w", err)
			}
			platformData.PlatformInfo.SshPrivKey = sshPrivKey

			sshPubKey, err := readSshPublicKeyFromFile(platformData)
			if err != nil {
				return fmt.Errorf("error reading SSH public key from file: %w", err)
			}
			platformData.PlatformInfo.SshPubKey = sshPubKey

		} else {
			bitSize := 4096
			privateKey, err := generatePrivateKey(bitSize)
			if err != nil {
				return err
			}

			publicKeyBytes, err := generatePublicKey(&privateKey.PublicKey)
			if err != nil {
				return err
			}
			platformData.PlatformInfo.SshPubKey = string(publicKeyBytes)

			privateKeyBytes := encodePrivateKeyToPEM(privateKey)
			platformData.PlatformInfo.SshPrivKey = string(privateKeyBytes)
		}
	}

	return nil
}

func generatePrivateKey(bitSize int) (*rsa.PrivateKey, error) {
	privateKey, err := rsa.GenerateKey(rand.Reader, bitSize)
	if err != nil {
		return nil, err
	}

	err = privateKey.Validate()
	if err != nil {
		return nil, err
	}

	return privateKey, nil
}

// encodePrivateKeyToPEM encodes Private Key from RSA to PEM format
func encodePrivateKeyToPEM(privateKey *rsa.PrivateKey) []byte {
	privDER := x509.MarshalPKCS1PrivateKey(privateKey)

	privBlock := pem.Block{
		Type:    "RSA PRIVATE KEY",
		Headers: nil,
		Bytes:   privDER,
	}

	privatePEM := pem.EncodeToMemory(&privBlock)

	return privatePEM
}

func generatePublicKey(privatekey *rsa.PublicKey) ([]byte, error) {
	publicRsaKey, err := ssh.NewPublicKey(privatekey)
	if err != nil {
		return nil, err
	}

	pubKeyBytes := ssh.MarshalAuthorizedKey(publicRsaKey)

	return pubKeyBytes, nil
}

func CopyKeyInNode(nodeData common.NodeData, publicKey string) error {
	sshConfig := configWithPassword(nodeData.NodeUserName, nodeData.NodePassword)
	client, err := ssh.Dial("tcp", nodeData.NodeIP+":22", sshConfig)
	if err != nil {
		return err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	session.Stdin = strings.NewReader(publicKey + "\n")

	command := fmt.Sprintf(`
if ! grep -Fxq "%s" ~/.ssh/authorized_keys; then
	mkdir -p ~/.ssh
	chmod 700 ~/.ssh
	echo "%s" >> ~/.ssh/authorized_keys
	chmod 600 ~/.ssh/authorized_keys
	echo "Clave pública añadida."
else
	echo "The public key already exists in authorized_keys."
fi
`, strings.ReplaceAll(publicKey, `"`, `\"`), publicKey)

	err = session.Run(command)
	if err != nil {
		return err
	}

	return nil
}

func executeScriptOnRemoteHost(nodeData common.NodeData, privateKey, script string, args ...string) (string, error) {
    sshConfig := SshConfigWithKey(nodeData.NodeUserName, privateKey)
    client, err := ssh.Dial("tcp", nodeData.NodeIP+":22", sshConfig)
    if err != nil {
        return "", fmt.Errorf("error connecting to remote host: %w", err)
    }
    defer client.Close()

    session, err := client.NewSession()
    if err != nil {
        return "", fmt.Errorf("error creating SSH session: %w", err)
    }
    defer session.Close()

    cmdStr := fmt.Sprintf("bash -s %s", strings.Join(args, " "))
    
    session.Stdin = strings.NewReader(script)
    
    output, err := session.CombinedOutput(cmdStr)
    if err != nil {
        return "", fmt.Errorf("error executing remote script: %w\nOutput: %s", err, output)
    }
    
    return string(output), nil
}

func readSshPrivateKeyFromFile(platformData *common.PlatformData) (string,error) {
	sshPrivateKeyPath := giveSshPrivateKeyPath(platformData)
	keyBytes, err := os.ReadFile(sshPrivateKeyPath)
	if err != nil {
		return "", err
	}

	return string(keyBytes), nil
}

func readSshPublicKeyFromFile(platformData *common.PlatformData) (string,error) {
	sshPublicKeyPath := giveSshPublicKeyPath(platformData)
	keyBytes, err := os.ReadFile(sshPublicKeyPath)
	if err != nil {
		return "", err
	}

	return string(keyBytes), nil
}

func giveAwsSshKeyPath(platformData *common.PlatformData) string {
	awsSshKeyPath := platformData.PlatformInfo.AwsSshKeyPath
	if awsSshKeyPath == "" {
		awsSshKeyPath = "./.osi4iot_keys/aws_ssh_key.pem"
	}

	return awsSshKeyPath
}

func readAwsSshKeyFromFile(platformData *common.PlatformData) (string,error) {
	awsSshKeyPath := giveAwsSshKeyPath(platformData)
	keyBytes, err := os.ReadFile(awsSshKeyPath)
	if err != nil {
		return "", err
	}

	return string(keyBytes), nil
}


func GetSshPrivKey(platformData *common.PlatformData) (string, error) {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	sshPrivKey := ""
	var err error
	if deploymentLocation == "On-premise cluster deployment" {
		if platformData.PlatformInfo.SshPrivKey != "" {
			sshPrivKey = platformData.PlatformInfo.SshPrivKey
		} else {
			nodesData := platformData.PlatformInfo.NodesData
			if len(nodesData) == 1 {
				runningInLocalHost, err := utils.IsHostIP(nodesData[0].NodeIP)
				if err != nil {
					return "", fmt.Errorf("error checking if host is localhost: %w", err)
				}
				if runningInLocalHost {
					return "", nil
				}
			}
			sshPrivKey, err = readSshPrivateKeyFromFile(platformData)
			if err != nil {
				return "", err
			}
		}
	} else if deploymentLocation == "AWS cluster deployment" {
		sshPrivKey = platformData.PlatformInfo.AwsSshKey
		if sshPrivKey == "" {
			sshPrivKey, err = readAwsSshKeyFromFile(platformData)
			if err != nil {
				return "", err
			}
		}
	}

	return sshPrivKey, nil
}
