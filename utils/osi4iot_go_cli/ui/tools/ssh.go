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
	"golang.org/x/crypto/ssh"
)

func ConfigWithPassword(user, password string) *ssh.ClientConfig {
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
				signer, err := PrivateKeySigner(privateKey)
				if err != nil {
					return nil, err
				}
				return []ssh.Signer{signer}, nil
			}),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
}

func PrivateKeySigner(privateKey string) (ssh.Signer, error) {
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

func CreateKeyPair(data *common.PlatformData) error {
	if data.PlatformInfo.SshPrivKey == "" && data.PlatformInfo.SshPubKey == "" {
		// err := CreateDirectoryIfNotExists("./.osi4iot_keys")
		// if err != nil {
		// 	return err
		// }
		// savePrivateFileTo := "./.osi4iot_keys/osi4iot_key"
		// savePublicFileTo := "./.osi4iot_keys/osi4iot_key.pub"
		bitSize := 4096

		privateKey, err := generatePrivateKey(bitSize)
		if err != nil {
			return err
		}

		publicKeyBytes, err := generatePublicKey(&privateKey.PublicKey)
		if err != nil {
			return err
		}
		data.PlatformInfo.SshPubKey = string(publicKeyBytes)

		privateKeyBytes := encodePrivateKeyToPEM(privateKey)
		data.PlatformInfo.SshPrivKey = string(privateKeyBytes)

		// err = writeKeyToFile(privateKeyBytes, savePrivateFileTo)
		// if err != nil {
		// 	return err
		// }

		// err = writeKeyToFile(publicKeyBytes, savePublicFileTo)
		// if err != nil {
		// 	return err
		// }
	}

	return nil
}

// generatePrivateKey creates a RSA Private Key of specified byte size
func generatePrivateKey(bitSize int) (*rsa.PrivateKey, error) {
	// Private Key generation
	privateKey, err := rsa.GenerateKey(rand.Reader, bitSize)
	if err != nil {
		return nil, err
	}

	// Validate Private Key
	err = privateKey.Validate()
	if err != nil {
		return nil, err
	}

	return privateKey, nil
}

// encodePrivateKeyToPEM encodes Private Key from RSA to PEM format
func encodePrivateKeyToPEM(privateKey *rsa.PrivateKey) []byte {
	// Get ASN.1 DER format
	privDER := x509.MarshalPKCS1PrivateKey(privateKey)

	// pem.Block
	privBlock := pem.Block{
		Type:    "RSA PRIVATE KEY",
		Headers: nil,
		Bytes:   privDER,
	}

	// Private key in PEM format
	privatePEM := pem.EncodeToMemory(&privBlock)

	return privatePEM
}

// generatePublicKey take a rsa.PublicKey and return bytes suitable for writing to .pub file
// returns in the format "ssh-rsa ..."
func generatePublicKey(privatekey *rsa.PublicKey) ([]byte, error) {
	publicRsaKey, err := ssh.NewPublicKey(privatekey)
	if err != nil {
		return nil, err
	}

	pubKeyBytes := ssh.MarshalAuthorizedKey(publicRsaKey)

	return pubKeyBytes, nil
}

// writePemToFile writes keys to a file
func WriteKeyToFile(keyBytes []byte, saveFileTo string) error {
	err := os.WriteFile(saveFileTo, keyBytes, 0600)
	if err != nil {
		return err
	}

	return nil
}

func CopyKeyInNode(nodeData common.NodeData, publicKey string) error {
	sshConfig := ConfigWithPassword(nodeData.NodeUserName, nodeData.NodePassword)
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
