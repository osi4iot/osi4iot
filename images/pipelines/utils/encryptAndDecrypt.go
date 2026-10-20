package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// Same scheme as admin_api (src/.../encryption.ts), so that either side
// can read what the other writes:
//
//   - AES-256-GCM, 12-byte IV, 16-byte authentication tag.
//   - The key is ENCRYPTION_SECRET_KEY: 32 random bytes, hex-encoded (64
//     characters), decoded to raw bytes, not used as text.
//   - Stored as base64(JSON{"v":2,"iv":hex,"tag":hex,"content":hex}).
//   - Optional context: associated data, authenticated but not stored.
//     A value encrypted with a context only decrypts with the same one.
const (
	encIVLength      = 12
	encTagLength     = 16
	encFormatVersion = 2
)

type encryptedPayload struct {
	V       int    `json:"v"`
	IV      string `json:"iv"`
	Tag     string `json:"tag"`
	Content string `json:"content"`
}

// errNotAuthenticated is the same for every cause on purpose (wrong key,
// wrong context, tampering), as in admin_api.
var errNotAuthenticated = errors.New("encrypted value could not be authenticated")

// parseSecretKey decodes ENCRYPTION_SECRET_KEY.
func parseSecretKey(secretKey string) ([]byte, error) {
	key, err := hex.DecodeString(secretKey)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("ENCRYPTION_SECRET_KEY must be 64 hexadecimal characters (32 random bytes)")
	}
	return key, nil
}

func newGCM(secretKey string) (cipher.AEAD, error) {
	key, err := parseSecretKey(secretKey)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCMWithNonceSize(block, encIVLength)
}

// Encrypt encrypts text like admin_api's encrypt(text), without context.
func Encrypt(text string, secretKey string) (string, error) {
	return EncryptWithContext(text, secretKey, nil)
}

// Decrypt decrypts a value written by admin_api's encrypt(text), without
// context.
func Decrypt(encryptedText string, secretKey string) (string, error) {
	return DecryptWithContext(encryptedText, secretKey, nil)
}

// EncryptWithContext is admin_api's encrypt(text, context). A nil context
// means none; an empty one is still a context, as in admin_api.
func EncryptWithContext(text string, secretKey string, context *string) (string, error) {
	gcm, err := newGCM(secretKey)
	if err != nil {
		return "", err
	}
	iv := make([]byte, encIVLength)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}
	var aad []byte
	if context != nil {
		aad = []byte(*context)
	}
	// Go appends the tag to the ciphertext; admin_api stores it apart.
	sealed := gcm.Seal(nil, iv, []byte(text), aad)
	content, tag := sealed[:len(sealed)-encTagLength], sealed[len(sealed)-encTagLength:]

	jsonData, err := json.Marshal(encryptedPayload{
		V:       encFormatVersion,
		IV:      hex.EncodeToString(iv),
		Tag:     hex.EncodeToString(tag),
		Content: hex.EncodeToString(content),
	})
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(jsonData), nil
}

// DecryptWithContext is admin_api's decrypt(encryptedText, context).
func DecryptWithContext(encryptedText string, secretKey string, context *string) (string, error) {
	gcm, err := newGCM(secretKey)
	if err != nil {
		return "", err
	}

	jsonData, err := base64.StdEncoding.DecodeString(encryptedText)
	if err != nil {
		return "", errors.New("encrypted value is not valid base64-encoded JSON")
	}
	var payload encryptedPayload
	if err := json.Unmarshal(jsonData, &payload); err != nil {
		return "", errors.New("encrypted value is not valid base64-encoded JSON")
	}
	if payload.V != encFormatVersion {
		return "", fmt.Errorf("unsupported encrypted value format (v=%d); "+
			"values from the previous scheme have to be re-entered", payload.V)
	}

	iv, err := hex.DecodeString(payload.IV)
	if err != nil || len(iv) != encIVLength {
		return "", errors.New("invalid IV length in encrypted value")
	}
	tag, err := hex.DecodeString(payload.Tag)
	if err != nil || len(tag) != encTagLength {
		return "", errors.New("invalid authentication tag length in encrypted value")
	}
	content, err := hex.DecodeString(payload.Content)
	if err != nil {
		return "", errNotAuthenticated
	}

	var aad []byte
	if context != nil {
		aad = []byte(*context)
	}
	// Go expects ciphertext||tag.
	plaintext, err := gcm.Open(nil, iv, append(content, tag...), aad)
	if err != nil {
		return "", errNotAuthenticated
	}
	return string(plaintext), nil
}