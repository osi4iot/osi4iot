package crypto

import (
	"fmt"
	"os"

	"github.com/zalando/go-keyring"
)

const (
	keyringService = "osi4iot"
	keyringUser    = "encryption-key"
)

var noEncrypt bool

func SetNoEncrypt(val bool) {
    noEncrypt = val
    if val {
        fmt.Println("⚠️  Modo sin cifrado activado. NO usar en producción.")
    }
}

func IsNoEncrypt() bool {
    return noEncrypt
}

// GetPassphrase obtiene la passphrase por este orden de prioridad:
// 1. Variable de entorno OSI4IOT_PASSPHRASE (CI/CD)
// 2. Keystore del SO (sesiones posteriores)
// 3. Prompt interactivo al usuario (primera vez)
func GetPassphrase() ([]byte, error) {
    if noEncrypt {
        return nil, nil
    }

	// 1. Variable de entorno
	if val := os.Getenv("OSI4IOT_PASSPHRASE"); val != "" {
		return []byte(val), nil
	}

	// 2. Keystore del SO
	if val, err := keyring.Get(keyringService, keyringUser); err == nil {
		return []byte(val), nil
	}

	// 3. Prompt interactivo
	fmt.Print("🔑 Introduce la passphrase de osi4iot: ")
	passphrase, err := readPassphrase()
	if err != nil {
		return nil, fmt.Errorf("error leyendo passphrase: %w", err)
	}
	fmt.Println()

	// Guardar en keystore para no pedirla de nuevo
	if err := keyring.Set(keyringService, keyringUser, string(passphrase)); err != nil {
		// No es un error fatal, simplemente no se guarda
		fmt.Println("⚠️  No se pudo guardar la passphrase en el keystore del SO.")
	}

	return passphrase, nil
}

// ClearPassphrase elimina la passphrase del keystore (útil en "osi4iot delete")
func ClearPassphrase() {
	if noEncrypt {
		return
	}
	keyring.Delete(keyringService, keyringUser)
}