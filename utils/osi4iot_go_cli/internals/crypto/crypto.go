package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"

	"golang.org/x/crypto/argon2"
)

const (
	saltSize = 16
	keySize  = 32 // AES-256
)

// Encrypt cipher plaintext using AES-GCM with a key derived from passphrase.
// The result includes: salt (16) + nonce (12) + ciphertext, all in base64.
func Encrypt(plaintext []byte, passphrase []byte) ([]byte, error) {
	if IsNoEncrypt() {
		return plaintext, nil // return plain text as is, assuming it's JSON data for osi4iot_state.json
	}

	salt := make([]byte, saltSize)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("error generando salt: %w", err)
	}

	key := deriveKey(passphrase, salt)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("error generando nonce: %w", err)
	}

	ciphertext := aesGCM.Seal(nonce, nonce, plaintext, nil)

	// salat + ciphertext (nonce included) -> base64(salt + nonce + ciphertext)
	result := append(salt, ciphertext...)
	encoded := make([]byte, base64.StdEncoding.EncodedLen(len(result)))
	base64.StdEncoding.Encode(encoded, result)
	return encoded, nil
}

// Decrypt unciphers a file encrypted with Encrypt.
func Decrypt(encoded []byte, passphrase []byte) ([]byte, error) {
	if IsNoEncrypt() {
		if !json.Valid(encoded) {
			return nil, fmt.Errorf(
				"osi4iot_state.json appears to be encrypted but --no-encrypt flag is set.\n" +
					"Remove the file or run without --no-encrypt",
			)
		}
		return encoded, nil
	}

	// If the data is not base64-encoded, assume it's plaintext (for backward compatibility)
	if json.Valid(encoded) {
		return encoded, nil
	}

	return decrypt(encoded, passphrase)

}

// derviKey derives an AES-256 key from passphrase + salt using Argon2id.
func deriveKey(passphrase, salt []byte) []byte {
	return argon2.IDKey(passphrase, salt,
		1,       // time cost
		64*1024, // memory cost: 64MB
		4,       // threads
		keySize,
	)
}

// DecryptWithPassphrase is a helper that tries to decrypt but falls back to plaintext if data is not base64-encoded.
func DecryptWithPassphrase(encoded []byte, passphrase []byte) ([]byte, error) {
	if json.Valid(encoded) {
		return encoded, nil // ya es texto plano
	}
	return decrypt(encoded, passphrase)
}

// IsNoEncrypt checks if the NO_ENCRYPT environment variable is set to "true".
func decrypt(encoded []byte, passphrase []byte) ([]byte, error) {
	data := make([]byte, base64.StdEncoding.DecodedLen(len(encoded)))
	n, err := base64.StdEncoding.Decode(data, encoded)
	if err != nil {
		return nil, fmt.Errorf("error decoding base64: %w", err)
	}
	data = data[:n]

	if len(data) < saltSize {
		return nil, fmt.Errorf("invalid encrypted data")
	}

	salt := data[:saltSize]
	ciphertext := data[saltSize:]

	key := deriveKey(passphrase, salt)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext demasiado corto")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		// Generic error to avoid revealing if it was an incorrect passphrase or corrupted data
		return nil, fmt.Errorf("error al descifrar: passphrase incorrecta o datos corruptos")
	}

	return plaintext, nil
}
