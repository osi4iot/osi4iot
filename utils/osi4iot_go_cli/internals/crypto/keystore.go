package crypto

import (
	"fmt"
	"os"
	"path/filepath"

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
func GetPassphrase() ([]byte, error) {
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

	// 4. Interactive prompt (first time)
	fmt.Print("🔑 Enter the osi4iot passphrase: ")
	passphrase, err := readPassphrase()
	if err != nil {
		return nil, fmt.Errorf("error reading passphrase: %w", err)
	}
	fmt.Println()

	// Try OS keystore first
	// if err := keyring.Set(keyringService, keyringUser, string(passphrase)); err != nil {
	// 	// Keystore not available (headless server), fall back to encrypted file
	// 	if err := savePassphraseFile(passphrase); err != nil {
	// 		fmt.Println("⚠️  Could not save the passphrase. You will be prompted on every command.")
	// 	} else {
	// 		fmt.Printf("🔑 Passphrase saved to %s\n", passphraseFilePath())
	// 	}
	// }
	if err := keyring.Set(keyringService, keyringUser, string(passphrase)); err != nil {
		// Keystore not available (headless server), fall back to encrypted file
		if err := savePassphraseFile(passphrase); err != nil {
			fmt.Printf("⚠️  XXXXXXXXXXXXXXXX Could not save the passphrase: %v\n", err) // 👈 mostrar el error concreto
			fmt.Println("⚠️  You will be prompted on every command.")
		} else {
			fmt.Printf("🔑 Passphrase saved to %s\n", passphraseFilePath())
		}
	}

	return passphrase, nil
}

// ClearPassphrase removes the passphrase from the keystore and local file (useful in "osi4iot delete")
func ClearPassphrase() {
	if noEncrypt {
		return
	}
	keyring.Delete(keyringService, keyringUser)
	os.Remove(passphraseFilePath())
}

// PromptPassphrase asks the user for the passphrase explicitly, bypassing the keystore.
// Used in commands that require conscious user confirmation (e.g. state export).
func PromptPassphrase() ([]byte, error) {
	return readPassphrase()
}

func passphraseFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		// Fallback al directorio del binario
		return fallbackPassphraseFilePath()
	}
	return filepath.Join(home, ".osi4iot", passphraseFile)
}

func fallbackPassphraseFilePath() string {
	execPath, err := os.Executable()
	if err != nil {
		return passphraseFile
	}
	resolved, err := filepath.EvalSymlinks(execPath)
	if err != nil {
		resolved = execPath
	}
	return filepath.Join(filepath.Dir(resolved), passphraseFile)
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
	encrypted, err := os.ReadFile(passphraseFilePath())
	if err != nil {
		return nil, err
	}

	machineKey, err := getMachineKey()
	if err != nil {
		return nil, err
	}

	return decrypt(encrypted, machineKey)
}
