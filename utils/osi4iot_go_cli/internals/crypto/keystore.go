package crypto

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/osi4iot/osi4iot/utils/osi4iot/paths"
	"github.com/zalando/go-keyring"
)

const rootPassphraseFile = "/root/.osi4iot/.passphrase"

const (
	keyringService = "osi4iot"
	keyringUser    = "encryption-key"
	passphraseFile = ".passphrase"
)

var noEncrypt bool

// PassphraseSource identifies where the passphrase was obtained from or stored to.
type PassphraseSource int

const (
	PassphraseFromEnv     PassphraseSource = iota // OSI4IOT_PASSPHRASE environment variable (CI/CD)
	PassphraseFromKeyring                         // OS keystore (macOS Keychain, Linux libsecret, Windows Credential Manager)
	PassphraseFromFile                            // Encrypted local file (headless servers, EC2)
	PassphraseFromPrompt                          // Interactive prompt (first-time setup)
)

func (s PassphraseSource) String() string {
	switch s {
	case PassphraseFromEnv:
		return "environment variable OSI4IOT_PASSPHRASE"
	case PassphraseFromKeyring:
		return "OS keystore"
	case PassphraseFromFile:
		return "local encrypted file"
	case PassphraseFromPrompt:
		return "interactive prompt"
	default:
		return "unknown"
	}
}

// PassphraseResult holds the passphrase value together with metadata about
// where it was obtained from. FilePath is only populated when Source is
// PassphraseFromFile.
type PassphraseResult struct {
	Value    []byte
	Source   PassphraseSource
	FilePath string
}

func SetNoEncrypt(val bool) {
	noEncrypt = val
	if val {
		fmt.Println("⚠️  Encryption disabled. DO NOT use in production.")
	}
}

func IsNoEncrypt() bool {
	return noEncrypt
}

// GetPassphrase obtains the passphrase using the following priority order:
//  1. Environment variable OSI4IOT_PASSPHRASE (CI/CD)
//  2. OS keystore (macOS Keychain, Linux libsecret, Windows Credential Manager)
//  3. Encrypted local file (headless servers, EC2)
//  4. Interactive prompt (first-time setup)
//
// Returns nil when encryption is disabled via SetNoEncrypt.
func GetPassphrase(encodedFile []byte) (*PassphraseResult, error) {
	if noEncrypt {
		return nil, nil
	}

	// 1. Environment variable
	if val := os.Getenv("OSI4IOT_PASSPHRASE"); val != "" {
		return &PassphraseResult{
			Value:  []byte(val),
			Source: PassphraseFromEnv,
		}, nil
	}

	// 2. OS keystore
	if val, err := keyring.Get(keyringService, keyringUser); err == nil {
		return &PassphraseResult{
			Value:  []byte(val),
			Source: PassphraseFromKeyring,
		}, nil
	}

	// 3. Encrypted local file
	if val, filePath, err := readPassphraseFile(); err == nil {
		return &PassphraseResult{
			Value:    val,
			Source:   PassphraseFromFile,
			FilePath: filePath,
		}, nil
	}

	// 4. Interactive prompt with validation loop
	for {
		fmt.Print("🔑 Enter the osi4iot state file passphrase: ")
		passphrase, err := readPassphrase()
		if err != nil {
			return nil, fmt.Errorf("error reading passphrase: %w", err)
		}
		fmt.Println()

		// Verify the passphrase can decrypt the state file before storing it.
		if encodedFile != nil {
			if err := VerifyPassphrase(passphrase, encodedFile); err != nil {
				fmt.Printf("❌ %v. Please try again.\n", err)
				continue
			}
		}

		result := &PassphraseResult{
			Value:  passphrase,
			Source: PassphraseFromPrompt,
		}

		// Try the OS keystore first; fall back to an encrypted local file on
		// headless servers where a keystore is not available.
		if err := keyring.Set(keyringService, keyringUser, string(passphrase)); err != nil {
			filePath := passphraseFilePath()
			if err := savePassphraseFile(passphrase); err != nil {
				fmt.Println("⚠️  Could not save the passphrase. You will be prompted on every command.")
			} else {
				result.FilePath = filePath
				fmt.Printf("🔑 Passphrase saved to %s\n", filePath)
			}
		}

		return result, nil
	}
}

// VerifyPassphrase checks that the passphrase can decrypt the state file.
// If the state file does not exist yet (first-time setup), any passphrase is accepted.
func VerifyPassphrase(passphrase []byte, encodedFile []byte) error {
	// json.Valid is checked inside Decrypt, so plaintext files are returned as-is.
	// For encrypted files, a wrong passphrase surfaces as an AES-GCM auth tag error.
	if _, err := Decrypt(encodedFile, passphrase); err != nil {
		return fmt.Errorf("incorrect passphrase")
	}
	return nil
}

// ClearPassphrase removes the passphrase from both the OS keystore and any
// local encrypted passphrase files found across all candidate directories.
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

// PromptPassphrase asks the user for the passphrase explicitly, bypassing all
// automatic lookup mechanisms (keystore, file, environment variable).
func PromptPassphrase() ([]byte, error) {
	return readPassphrase()
}

// passphraseFilePath returns the default path for the encrypted passphrase file.
func passphraseFilePath() string {
	return filepath.Join(paths.Osi4iotDir(), passphraseFile)
}

// findPassphraseFile searches all candidate directories for an existing
// passphrase file. Returns the path and true if found, or the default path
// and false if not found.
func findPassphraseFile() (string, bool) {
    candidates := append(paths.Osi4iotDirCandidates(), "/root/.osi4iot")
    for _, dir := range candidates {
        p := filepath.Join(dir, passphraseFile)
        if _, err := os.Stat(p); err == nil {
            return p, true
        }
    }
    return passphraseFilePath(), false
}

// savePassphraseFile encrypts the passphrase with the machine key and writes
// it to the default passphrase file path, creating parent directories as needed.
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

// readPassphraseFile finds, reads and decrypts the passphrase file using the
// machine key. Returns the plaintext passphrase and the path where it was found.
func readPassphraseFile() ([]byte, string, error) {
	filePath, found := findPassphraseFile()
	if !found {
		return nil, "", fmt.Errorf("passphrase file not found")
	}

	encrypted, err := os.ReadFile(filePath)
	if err != nil {
		return nil, "", err
	}

	machineKey, err := getMachineKey()
	if err != nil {
		return nil, "", err
	}

	val, err := decrypt(encrypted, machineKey)
	if err != nil {
		return nil, "", err
	}

	return val, filePath, nil
}

func EnsureRootPassphraseFile() error {
    // Si ya existe, no hacer nada
    if _, err := os.Stat(rootPassphraseFile); err == nil {
        return nil
    }

    var passphrase []byte

    // 1. Variable de entorno (ya resuelta y preservada por reexecAsRootIfNeeded)
    if val := os.Getenv("OSI4IOT_PASSPHRASE"); val != "" {
        passphrase = []byte(val)
    } else {
        // 2. Archivo cifrado del usuario actual
        var err error
        passphrase, _, err = readPassphraseFile()
        if err != nil {
            // 3. Keyring como último recurso
            val, kerr := keyring.Get(keyringService, keyringUser)
            if kerr != nil {
                return fmt.Errorf("could not obtain passphrase: %w", kerr)
            }
            passphrase = []byte(val)
        }
    }

    // Cifrarlo con la machine key y guardarlo en /root/.osi4iot/
    machineKey, err := getMachineKey()
    if err != nil {
        return err
    }
    encrypted, err := Encrypt(passphrase, machineKey)
    if err != nil {
        return err
    }
    if err := os.MkdirAll(filepath.Dir(rootPassphraseFile), 0700); err != nil {
        return err
    }
    return os.WriteFile(rootPassphraseFile, encrypted, 0600)
}