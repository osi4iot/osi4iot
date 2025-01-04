package tools

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"os"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"golang.org/x/crypto/ssh"
)

type NodeData struct {
	HostName string
	IP       string
	UserName string
	Role     string
	Password string
}

func ConfigWithPassword(user, password string) *ssh.ClientConfig {
	return &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
}

func ConfigWithKey(user, keyPath string) *ssh.ClientConfig {
	return &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			PublicKeyFile(keyPath),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
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

func CreateKeyPair() error {
	if data.Data.PlatformInfo.SshPrivKey == "" && data.Data.PlatformInfo.SshPubKey == "" {
		err := CreateDirectoryIfNotExists("./.osi4iot_keys")
		if err != nil {
			return err
		}
		savePrivateFileTo := "./.osi4iot_keys/osi4iot_key"
		savePublicFileTo := "./.osi4iot_keys/osi4iot_key.pub"
		bitSize := 4096

		privateKey, err := generatePrivateKey(bitSize)
		if err != nil {
			return err
		}

		publicKeyBytes, err := generatePublicKey(&privateKey.PublicKey)
		if err != nil {
			return err
		}

		privateKeyBytes := encodePrivateKeyToPEM(privateKey)

		err = writeKeyToFile(privateKeyBytes, savePrivateFileTo)
		if err != nil {
			return err
		}

		err = writeKeyToFile([]byte(publicKeyBytes), savePublicFileTo)
		if err != nil {
			return err
		}
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
func writeKeyToFile(keyBytes []byte, saveFileTo string) error {
	err := os.WriteFile(saveFileTo, keyBytes, 0600)
	if err != nil {
		return err
	}

	return nil
}

func CopyKeyInNode(nodeData NodeData) error {
	publicKeyPath := "./.osi4iot_keys/osi4iot_key.pub"
	keyFile, err := os.Open(publicKeyPath)
	if err != nil {
		return err
	}
	defer keyFile.Close()

	sshConfig := ConfigWithPassword(nodeData.UserName, nodeData.Password)
	client, err := ssh.Dial("tcp", nodeData.IP+":22", sshConfig)
	if err != nil {
		return err
	}
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	session.Stdin = keyFile

	//Guardar la clave publica en el archivo authorized_keys
	command := "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
	err = session.Run(command)
	if err != nil {
		return err
	}
	return nil
}
