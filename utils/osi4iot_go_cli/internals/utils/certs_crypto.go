package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
)

// This file is the CLI half of the format system_manager's
// internal/certstore reads and writes: AES-256-GCM, ciphertext laid out
// as base64(nonce||ciphertext||tag) on a single line. The two
// implementations must stay byte-compatible — the CLI encrypts the
// initial certificates into the system_manager_certs secret and
// decrypts whatever system_manager hands back (over NATS, or read
// straight off its volume); system_manager does the mirror image.
//
// It is deliberately NOT internals/crypto: that package derives its key
// from an interactively-prompted passphrase (Argon2id + per-file salt),
// which is right for osi4iot_state.json and impossible for
// system_manager, which has no console to prompt at. The key here is
// PlatformInfo.PlatformEncryptionKey — 32 random bytes, hex encoded,
// generated once at platform creation and then carried inside the state
// file that internals/crypto already protects.

// certsAEAD builds the AES-256-GCM AEAD from a hex-encoded 32-byte key.
func certsAEAD(hexKey string) (cipher.AEAD, error) {
	key, err := hex.DecodeString(strings.TrimSpace(hexKey))
	if err != nil {
		return nil, fmt.Errorf("certs encryption key is not valid hex: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("certs encryption key must decode to 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("building AES cipher: %w", err)
	}
	return cipher.NewGCM(block)
}

// EncryptCertsBlob encrypts plain under hexKey and returns
// base64(nonce||ciphertext||tag) — exactly what certstore.Store.Decrypt
// expects to read.
func EncryptCertsBlob(hexKey string, plain []byte) (string, error) {
	aead, err := certsAEAD(hexKey)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generating nonce: %w", err)
	}
	return base64.StdEncoding.EncodeToString(aead.Seal(nonce, nonce, plain, nil)), nil
}

// DecryptCertsBlob reverses EncryptCertsBlob. A failure means the blob
// was produced under a different key, or was tampered with — not that
// it's malformed JSON, which surfaces separately in the caller's
// json.Unmarshal.
func DecryptCertsBlob(hexKey string, blob string) ([]byte, error) {
	aead, err := certsAEAD(hexKey)
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(blob))
	if err != nil {
		return nil, fmt.Errorf("certs blob is not valid base64: %w", err)
	}
	if len(raw) < aead.NonceSize() {
		return nil, errors.New("certs blob is too short to contain a nonce")
	}
	nonce, sealed := raw[:aead.NonceSize()], raw[aead.NonceSize():]
	plain, err := aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		return nil, fmt.Errorf("could not decrypt certs blob "+
			"(wrong CERTS_ENCRYPTION_KEY, or the blob was corrupted): %w", err)
	}
	return plain, nil
}
