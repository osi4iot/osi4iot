package crypto

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/osi4iot/osi4iot/utils/osi4iot/paths"
	"github.com/zalando/go-keyring"
)

const (
	keyringService = "osi4iot"
	keyringUser    = "encryption-key"
	passphraseFile = ".passphrase"
)

var noEncrypt bool

func SetNoEncrypt(val bool) {
	noEncrypt = val
	if val {
		fmt.Println("⚠️  Encryption disabled. DO NOT use in production.")
	}
}

func IsNoEncrypt() bool {
	return noEncrypt
}

// GetPassphrase obtains the passphrase in this order of priority:
// 1. Environment variable OSI4IOT_PASSPHRASE (CI/CD)
// 2. OS keystore (macOS Keychain, Linux libsecret, Windows Credential Manager)
// 3. Encrypted local file (headless servers, EC2)
// 4. Interactive prompt to the user (first time)
func GetPassphrase(encodedFile []byte) ([]byte, error) {
	if noEncrypt {
		return nil, nil
	}

	// 1. Environment variable
	if val := os.Getenv("OSI4IOT_PASSPHRASE"); val != "" {
		return []byte(val), nil
	}

	// 2. OS keystore
	if val, err := keyring.Get(keyringService, keyringUser); err == nil {
		return []byte(val), nil
	}

	// 3. Encrypted local file (headless servers, EC2)
	if val, err := readPassphraseFile(); err == nil {
		return val, nil
	}

	// 4. Interactive prompt with validation loop
	for {
		fmt.Print("🔑 Enter the osi4iot state file passphrase: ")
		passphrase, err := readPassphrase()
		if err != nil {
			return nil, fmt.Errorf("error reading passphrase: %w", err)
		}
		fmt.Println()

		// Verify passphrase before storing it
		if encodedFile != nil {
			if err := VerifyPassphrase(passphrase, encodedFile); err != nil {
				fmt.Printf("❌ %v. Please try again.\n", err)
				continue
			}
		}

		// Try OS keystore first
		if err := keyring.Set(keyringService, keyringUser, string(passphrase)); err != nil {
			// Keystore not available (headless server), fall back to encrypted file
			if err := savePassphraseFile(passphrase); err != nil {
				fmt.Println("⚠️  Could not save the passphrase. You will be prompted on every command.")
			} else {
				fmt.Printf("🔑 Passphrase saved to %s\n", passphraseFilePath())
			}
		}

		return passphrase, nil
	}
}

// VerifyPassphrase checks that the passphrase can decrypt the state file.
// If the state file does not exist yet (first-time setup), any passphrase is accepted.
func VerifyPassphrase(passphrase []byte, encodedFile []byte) error {
	// json.Valid check is already inside Decrypt, so if the file is plaintext it
	// will be returned as-is. If it IS encrypted, a wrong passphrase will surface
	// as a decryption error from AES-GCM's authentication tag check.
	if _, err := Decrypt(encodedFile, passphrase); err != nil {
		return fmt.Errorf("incorrect passphrase")
	}
	return nil
}

// ClearPassphrase removes the passphrase from the keystore and local file
func ClearPassphrase() {
	if noEncrypt {
		return
	}
	keyring.Delete(keyringService, keyringUser)

	for _, dir := range paths.Osi4iotDirCandidates() {
		err := os.Remove(filepath.Join(dir, passphraseFile))
		if err != nil && !os.IsNotExist(err) {
			fmt.Printf("⚠️  Could not remove passphrase file: %v\n", err)
		}
	}
}

// PromptPassphrase asks the user for the passphrase explicitly, bypassing the keystore.
func PromptPassphrase() ([]byte, error) {
	return readPassphrase()
}

func passphraseFilePath() string {
	return filepath.Join(paths.Osi4iotDir(), passphraseFile)
}

func findPassphraseFile() string {
	for _, dir := range paths.Osi4iotDirCandidates() {
		p := filepath.Join(dir, passphraseFile)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return passphraseFilePath()
}

func savePassphraseFile(passphrase []byte) error {
	machineKey, err := getMachineKey()
	if err != nil {
		return err
	}

	encrypted, err := Encrypt(passphrase, machineKey)
	if err != nil {
		return err
	}

	os.MkdirAll(filepath.Dir(passphraseFilePath()), 0700)
	return os.WriteFile(passphraseFilePath(), encrypted, 0600)
}

func readPassphraseFile() ([]byte, error) {
	encrypted, err := os.ReadFile(findPassphraseFile())
	if err != nil {
		return nil, err
	}
	machineKey, err := getMachineKey()
	if err != nil {
		return nil, err
	}
	return decrypt(encrypted, machineKey)
}
