// Package certstore is the only place system_manager reads or writes the
// platform's ACME state (account key + issued certificate material) on
// disk. That state used to live as plaintext JSON in
// /data/certrenewer/domain_certs.json — a Docker volume on a manager
// node, readable by anything with host access — and it contains the
// domain's TLS PRIVATE KEY, so it is now stored encrypted with
// AES-256-GCM under a key the platform CLI generates once, keeps in the
// (already encrypted) state file, and hands to this service through the
// Docker secret mounted at /run/secrets/system_manager.txt
// (PLATFORM_ENCRYPTION_KEY — see secrets/system_manager.go on the CLI
// side, and DeriveSubkey below).
//
// The same key is what makes two other things work:
//
//   - Seed (Punto 4): on the very first deployment the CLI itself
//     obtains the certificates, so this volume would otherwise be empty
//     until the first renewal. The CLI ships that initial DomainCerts as
//     a SECOND, already-encrypted Docker secret; Seed copies it into the
//     volume at startup when the volume has nothing newer.
//
//   - Export (Punto 3): the CLI can ask for the stored blob back over
//     NATS (see certrenewer.Exporter) and decrypt it locally, so its own
//     PlatformData can be refreshed after system_manager has renewed
//     behind its back. The blob travels as ciphertext: system_manager
//     never puts the private key on the wire in the clear, not even
//     inside the TLS-protected NATS connection.
//
// Ciphertext layout, both on disk and in the secret, is the base64 (std,
// padded) encoding of nonce||ciphertext||tag, on a single line — text so
// it can live in a Docker secret and be diffed/inspected without tooling.
package certstore

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"system_manager/internal/platform"
)

// purposeDomainCerts labels the subkey this package derives from
// PLATFORM_ENCRYPTION_KEY. The platform has one master key in its state
// file, and every consumer derives its own subkey from it with a
// different label — see DeriveSubkey. The CLI's
// utils.PurposeDomainCerts must match this string exactly.
const purposeDomainCerts = "osi4iot:domain-certs:v1"

// DeriveSubkey turns the platform's master key into a purpose-specific
// one. It is HKDF-Expand (RFC 5869) with a single output block: the
// master key is already 32 uniformly random bytes, so the Extract step
// HKDF would normally run first has nothing to do.
//
// The point is domain separation. One master key protecting two
// unrelated things — the certificates here, the state-file backups in
// internal/statefile — means the same key stream covers two different
// plaintext populations, and it means handing someone the ability to
// decrypt one necessarily hands them the other. Deriving costs one
// HMAC and removes both concerns: the subkeys are independent, and a
// recovery procedure can hand out the state-file subkey without
// exposing the domain's TLS private key.
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

const (
	// Dir is the volume mounted at /data/certrenewer (see
	// services/system_manager.go on the CLI side).
	Dir = "/data/certrenewer"
	// File is the encrypted state, replacing LegacyPlaintextFile.
	File = Dir + "/domain_certs.enc"
	// LegacyPlaintextFile is the pre-encryption state file. It is read
	// once, re-written encrypted, and removed — see MigrateLegacyPlaintext.
	LegacyPlaintextFile = Dir + "/domain_certs.json"
	// SeedFile is where the CLI's initial DomainCerts secret is mounted.
	SeedFile = "/run/secrets/system_manager_certs.enc"
)

// ErrNoState is returned by Load when there is no stored certificate
// material at all — the normal first-run case, not a failure. Callers
// check it with errors.Is and go obtain a fresh certificate.
var ErrNoState = errors.New("certstore: no stored certificate state")

// Store reads and writes the encrypted certificate state. It holds the
// AEAD built from the domain-certs subkey of PLATFORM_ENCRYPTION_KEY,
// so building one validates the key up front rather than at the first
// renewal, hours later.
type Store struct {
	aead cipher.AEAD
	file string
}

// New returns a Store keyed by a subkey derived from masterHex, the
// platform's PLATFORM_ENCRYPTION_KEY — a hex-encoded 32-byte key, what
// utils.GenerateHexKey(32) produces on the CLI side.
func New(masterHex string) (*Store, error) {
	return newAt(masterHex, File)
}

func newAt(masterHex, file string) (*Store, error) {
	key, err := DeriveSubkey(masterHex, purposeDomainCerts)
	if err != nil {
		return nil, fmt.Errorf("certstore: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("certstore: building AES cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("certstore: building GCM: %w", err)
	}
	return &Store{aead: aead, file: file}, nil
}

// Encrypt returns base64(nonce||ciphertext||tag) for plain.
func (s *Store) Encrypt(plain []byte) ([]byte, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("certstore: generating nonce: %w", err)
	}
	sealed := s.aead.Seal(nonce, nonce, plain, nil)
	out := make([]byte, base64.StdEncoding.EncodedLen(len(sealed)))
	base64.StdEncoding.Encode(out, sealed)
	return out, nil
}

// Decrypt reverses Encrypt. A failure here is authentication failure,
// not a parse error: either the file was tampered with, or — far more
// likely in practice — PLATFORM_ENCRYPTION_KEY is not the key this blob
// was written with. Callers must NOT treat that as "no state" and go
// re-issue from Let's Encrypt: with LE's duplicate-certificate rate
// limit, a wrong key on a restart loop would burn the week's quota.
func (s *Store) Decrypt(b64 []byte) ([]byte, error) {
	raw := make([]byte, base64.StdEncoding.DecodedLen(len(b64)))
	n, err := base64.StdEncoding.Decode(raw, []byte(strings.TrimSpace(string(b64))))
	if err != nil {
		return nil, fmt.Errorf("certstore: stored blob is not valid base64: %w", err)
	}
	raw = raw[:n]
	if len(raw) < s.aead.NonceSize() {
		return nil, errors.New("certstore: stored blob is too short to contain a nonce")
	}
	nonce, sealed := raw[:s.aead.NonceSize()], raw[s.aead.NonceSize():]
	plain, err := s.aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		return nil, fmt.Errorf("certstore: could not decrypt stored certificates "+
			"(wrong PLATFORM_ENCRYPTION_KEY, or the file was corrupted): %w", err)
	}
	return plain, nil
}

// LoadRaw returns the ciphertext exactly as stored, for the export path
// (see certrenewer.Exporter) — the CLI decrypts it itself with the key
// it already holds, so the private key is never serialized in the clear
// on this side.
func (s *Store) LoadRaw() ([]byte, error) {
	data, err := os.ReadFile(s.file)
	if os.IsNotExist(err) {
		return nil, ErrNoState
	}
	if err != nil {
		return nil, fmt.Errorf("certstore: reading %s: %w", s.file, err)
	}
	return data, nil
}

// Load returns the decrypted certificate state. A missing file yields
// ErrNoState; a present-but-undecryptable one yields a real error (see
// Decrypt).
func (s *Store) Load() (platform.DomainCerts, error) {
	var dc platform.DomainCerts
	raw, err := s.LoadRaw()
	if err != nil {
		return dc, err
	}
	plain, err := s.Decrypt(raw)
	if err != nil {
		return dc, err
	}
	if err := json.Unmarshal(plain, &dc); err != nil {
		return dc, fmt.Errorf("certstore: parsing decrypted certificates: %w", err)
	}
	return dc, nil
}

// Save encrypts dc and writes it via temp file + rename, so a crash
// mid-write can never leave the state truncated — the same guarantee the
// plaintext version gave, plus 0600 and an fsync'd directory entry.
func (s *Store) Save(dc platform.DomainCerts) error {
	plain, err := json.Marshal(dc)
	if err != nil {
		return fmt.Errorf("certstore: encoding certificates: %w", err)
	}
	blob, err := s.Encrypt(plain)
	if err != nil {
		return err
	}
	return s.writeRaw(blob)
}

func (s *Store) writeRaw(blob []byte) error {
	if err := os.MkdirAll(Dir, 0700); err != nil {
		return fmt.Errorf("certstore: creating %s: %w", Dir, err)
	}
	tmp := s.file + ".tmp"
	if err := os.WriteFile(tmp, blob, 0600); err != nil {
		return fmt.Errorf("certstore: writing %s: %w", tmp, err)
	}
	if err := os.Rename(tmp, s.file); err != nil {
		return fmt.Errorf("certstore: renaming %s: %w", tmp, err)
	}
	return nil
}

// MigrateLegacyPlaintext re-writes a pre-encryption domain_certs.json as
// the encrypted domain_certs.enc and removes the plaintext original. It
// is a no-op (false, nil) when there is no legacy file, or when an
// encrypted file already exists — the encrypted one always wins, so a
// stale plaintext leftover can never resurrect an older certificate.
// Returns whether a migration actually happened.
func (s *Store) MigrateLegacyPlaintext() (bool, error) {
	if _, err := os.Stat(s.file); err == nil {
		// Encrypted state already present: just make sure no plaintext
		// copy of the private key is left lying around in the volume.
		if err := os.Remove(LegacyPlaintextFile); err != nil && !os.IsNotExist(err) {
			return false, fmt.Errorf("certstore: removing legacy %s: %w", LegacyPlaintextFile, err)
		}
		return false, nil
	}

	plain, err := os.ReadFile(LegacyPlaintextFile)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("certstore: reading legacy %s: %w", LegacyPlaintextFile, err)
	}

	var dc platform.DomainCerts
	if err := json.Unmarshal(plain, &dc); err != nil {
		return false, fmt.Errorf("certstore: parsing legacy %s: %w", LegacyPlaintextFile, err)
	}
	if err := s.Save(dc); err != nil {
		return false, err
	}
	if err := os.Remove(LegacyPlaintextFile); err != nil && !os.IsNotExist(err) {
		return true, fmt.Errorf("certstore: removing legacy %s after migrating: %w", LegacyPlaintextFile, err)
	}
	return true, nil
}

// Seed populates the volume from the CLI-provided secret at seedPath
// (Punto 4). The CLI encrypts that secret with the SAME key, so this
// only has to decrypt it far enough to compare expiry dates.
//
// It writes only when the seed is genuinely better than what the volume
// holds: no stored state at all (first deployment, or a deleted volume),
// or a seed whose certificate outlives the stored one (the CLI has
// fresher material than this node does — e.g. the volume was restored
// from an old backup). It deliberately does NOT overwrite when the
// stored certificate is newer, which is the normal steady state after
// system_manager has renewed a few times and the CLI's secret still
// carries the original day-one certificate.
//
// The returned string is a human-readable summary for the startup log.
func (s *Store) Seed(seedPath string) (string, error) {
	seedBlob, err := os.ReadFile(seedPath)
	if os.IsNotExist(err) {
		return "no seed secret mounted at " + seedPath, nil
	}
	if err != nil {
		return "", fmt.Errorf("certstore: reading seed %s: %w", seedPath, err)
	}
	if len(strings.TrimSpace(string(seedBlob))) == 0 {
		return "seed secret is empty, ignoring", nil
	}

	seedPlain, err := s.Decrypt(seedBlob)
	if err != nil {
		return "", fmt.Errorf("certstore: decrypting seed secret: %w", err)
	}
	var seed platform.DomainCerts
	if err := json.Unmarshal(seedPlain, &seed); err != nil {
		return "", fmt.Errorf("certstore: parsing seed secret: %w", err)
	}
	if IsEmpty(seed) {
		return "seed secret carries no certificate material, ignoring", nil
	}

	stored, err := s.Load()
	switch {
	case errors.Is(err, ErrNoState):
		if err := s.Save(seed); err != nil {
			return "", err
		}
		return "seeded volume from the CLI secret (volume was empty)", nil
	case err != nil:
		// Undecryptable/corrupt stored state. Refuse to silently
		// clobber it: overwriting is unrecoverable, and the operator
		// needs to know the key stopped matching. Renewal will fail
		// loudly for the same reason, which is the intent.
		return "", err
	}

	seedExpiry := expiry(seed)
	storedExpiry := expiry(stored)
	if seedExpiry <= storedExpiry {
		return fmt.Sprintf("volume already holds certificates at least as fresh as the seed "+
			"(stored expiry %s, seed expiry %s), leaving it alone",
			formatTS(storedExpiry), formatTS(seedExpiry)), nil
	}
	if err := s.Save(seed); err != nil {
		return "", err
	}
	return fmt.Sprintf("replaced volume certificates with the fresher CLI seed "+
		"(stored expiry %s → seed expiry %s)",
		formatTS(storedExpiry), formatTS(seedExpiry)), nil
}

// IsEmpty reports whether dc carries no usable certificate material —
// the state a first run starts from, and what SetOrUpdateAcmeCerts
// treats as "obtain a brand-new certificate" rather than "renew".
func IsEmpty(dc platform.DomainCerts) bool {
	return dc.PrivateKey == "" || dc.SslCertCrt == "" || dc.SslCaPem == ""
}

// DaysToExpiry reports how many whole days are left on dc, computed from
// the persisted expiration timestamps rather than from a TLS handshake
// against the public domain (Punto 2). It mirrors the CLI's
// utils.GetCertsExpirationInfo: the earlier of the CA and leaf
// expirations wins, and both must be set.
//
// This replaces dialing domainName:443, which could not work at all in a
// local deployment whose domain doesn't resolve publicly — and which, on
// a real deployment, answered a subtly different question anyway ("what
// is traefik currently serving") than the one renewal actually needs
// ("how old is the certificate I hold"). Those two disagree exactly when
// a previous run renewed but failed to roll the new secret out to the
// services, which is precisely the case that must not be skipped.
func DaysToExpiry(dc platform.DomainCerts, now time.Time) (int, error) {
	caTS := dc.CaPemExpirationTimestamp
	certTS := dc.CertCrtExpirationTimestamp
	if caTS <= 0 || certTS <= 0 {
		return 0, errors.New("certstore: certificate expiration timestamps are not set")
	}
	ts := min(caTS, certTS)
	return int(time.Unix(ts, 0).Sub(now).Hours() / 24), nil
}

func expiry(dc platform.DomainCerts) int64 {
	if dc.CaPemExpirationTimestamp <= 0 || dc.CertCrtExpirationTimestamp <= 0 {
		return 0
	}
	return min(dc.CaPemExpirationTimestamp, dc.CertCrtExpirationTimestamp)
}

func formatTS(ts int64) string {
	if ts <= 0 {
		return "unknown"
	}
	return time.Unix(ts, 0).UTC().Format(time.RFC3339)
}