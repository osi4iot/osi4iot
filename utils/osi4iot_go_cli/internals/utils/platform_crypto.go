package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
)

// This file is the CLI half of the format system_manager reads and
// writes: AES-256-GCM, ciphertext laid out as
// base64(nonce||ciphertext||tag) on a single line. Both sides must stay
// byte-compatible — the CLI encrypts the initial certificates into the
// system_manager_certs secret, and decrypts what system_manager exports
// back.
//
// It is deliberately NOT internals/crypto: that package derives its key
// from an interactively-prompted passphrase (Argon2id + per-file salt),
// which is right for osi4iot_state.json on an operator's laptop and
// impossible for system_manager, which has no console to prompt at. The
// key here is PlatformInfo.PlatformEncryptionKey — 32 random bytes, hex
// encoded, generated once at platform creation and then carried inside
// the state file that internals/crypto already protects.
//
// The two packages are complementary, not redundant: internals/crypto
// protects the state file at rest on the operator's machine, this one
// protects platform material at rest anywhere else.

// Purposes for DeriveSubkey. One master key, one subkey per consumer.
// These strings are part of the wire format — system_manager derives
// with the identical labels (see its certstore.DeriveSubkey), so
// changing one here without changing it there orphans everything
// already encrypted under it.
const (
	// PurposeDomainCerts protects the domain certificates: the copy
	// system_manager keeps in its volume, and the seed secret the CLI
	// ships it at deploy time.
	//
	// It is currently the only purpose. The state file backups
	// deliberately do NOT use this key: they are protected by the
	// operator's passphrase through internals/crypto instead, because
	// recovering one has to be possible with nothing but something the
	// operator knows — see cmd/state.go. Derivation stays because the
	// next non-interactive consumer should get its own subkey rather
	// than reusing the certificates'.
	PurposeDomainCerts = "osi4iot:domain-certs:v1"
)

// DeriveSubkey turns the platform's master key into a purpose-specific
// one. It is HKDF-Expand (RFC 5869) with a single output block: the
// master key is already 32 uniformly random bytes, so the Extract step
// HKDF would normally run first has nothing to do.
//
// The point is domain separation: one master key should never be the
// literal encryption key for two unrelated plaintext populations.
// Deriving costs one HMAC and means a second consumer added later is
// independent of the certificates by construction, instead of by
// someone remembering to make it so.
func DeriveSubkey(masterHex, purpose string) ([]byte, error) {
	master, err := hex.DecodeString(strings.TrimSpace(masterHex))
	if err != nil {
		return nil, fmt.Errorf("platform encryption key is not valid hex: %w", err)
	}
	if len(master) != 32 {
		return nil, fmt.Errorf("platform encryption key must decode to 32 bytes, got %d", len(master))
	}
	mac := hmac.New(sha256.New, master)
	mac.Write([]byte(purpose))
	mac.Write([]byte{0x01}) // HKDF-Expand's counter, first and only block
	return mac.Sum(nil), nil
}

// EncryptWithPlatformKey encrypts plain under the subkey derived from
// masterHex for purpose, and returns base64(nonce||ciphertext||tag).
func EncryptWithPlatformKey(masterHex, purpose string, plain []byte) (string, error) {
	aead, err := platformAEAD(masterHex, purpose)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generating nonce: %w", err)
	}
	return base64.StdEncoding.EncodeToString(aead.Seal(nonce, nonce, plain, nil)), nil
}

// DecryptWithPlatformKey reverses EncryptWithPlatformKey. A failure
// means the blob was produced under a different key or purpose, or was
// tampered with — not that its contents are malformed, which surfaces
// separately in the caller's own parsing.
func DecryptWithPlatformKey(masterHex, purpose, blob string) ([]byte, error) {
	aead, err := platformAEAD(masterHex, purpose)
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(blob))
	if err != nil {
		return nil, fmt.Errorf("encrypted blob is not valid base64: %w", err)
	}
	if len(raw) < aead.NonceSize() {
		return nil, errors.New("encrypted blob is too short to contain a nonce")
	}
	nonce, sealed := raw[:aead.NonceSize()], raw[aead.NonceSize():]
	plain, err := aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		return nil, fmt.Errorf("could not decrypt (wrong PLATFORM_ENCRYPTION_KEY, "+
			"or the blob was corrupted): %w", err)
	}
	return plain, nil
}

func platformAEAD(masterHex, purpose string) (cipher.AEAD, error) {
	key, err := DeriveSubkey(masterHex, purpose)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("building AES cipher: %w", err)
	}
	return cipher.NewGCM(block)
}
