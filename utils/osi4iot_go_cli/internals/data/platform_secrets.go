package data

import (
	"fmt"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// GeneratedPasswordLength is the length of every password the platform
// generates for itself. utils.GeneratePassword draws from crypto/rand
// over 62 characters, so 20 characters are ~119 bits.
const GeneratedPasswordLength = 20

// GeneratedKeyBytes is the size of every key the platform generates for
// itself: 32 random bytes (256 bits), stored as 64 hex characters.
const GeneratedKeyBytes = 32

// GeneratePlatformSecrets creates every secret the platform generates for
// itself — none of them is ever asked of the administrator — and stores
// them in pd. The one place that says what a platform gets, and how.
//
// With force=false (creating a platform) a secret already set is kept.
// With force=true (`osi4iot init --reset-passwords`) every one of them is
// replaced. The fields are written directly rather than through SetData,
// whose "only if empty" guard on several of them would otherwise make a
// forced reset keep some old values and replace others, without a word.
//
// Two kinds, chosen by how the value is consumed:
//
//   - Keys (utils.GenerateHexKey): bytes that go into a cryptographic
//     algorithm or are compared as opaque tokens — encryption keys, JWT
//     signing secrets, the sidecar token. Always 32 random bytes, hex
//     encoded, so consumers can decode them to exactly 256 bits and
//     reject anything else.
//   - Passwords (utils.GeneratePassword): values another system stores
//     and compares as text — database roles, Grafana's datasource.
//
// Values chosen by the administrator in the form (platform admin
// password, e-mail…) are not generated, and are never touched here.
func GeneratePlatformSecrets(pd *pt.PlatformData, force bool) error {
	pi := &pd.PlatformInfo

	key := func() string { return utils.GenerateHexKey(GeneratedKeyBytes) }
	password := func() string { return utils.GeneratePassword(GeneratedPasswordLength) }

	type secret struct {
		field    *string
		generate func() string
	}

	secrets := []secret{
		// ── admin_api ───────────────────────────────────────────────
		// HMAC secrets signing the JWTs admin_api hands out. Anyone
		// holding a token can test guesses offline, so they are keys,
		// not passwords.
		{&pi.AccessTokenSecret, key},
		{&pi.RefreshTokenSecret, key},
		// AES-256-GCM key for the secrets admin_api stores in the
		// database. admin_api refuses to start with anything that does
		// not decode to exactly 32 bytes.
		{&pi.EncryptionSecretKey, key},

		// ── Platform master key ─────────────────────────────────────
		// The key this CLI and system_manager derive their per-purpose
		// subkeys from (domain certificates in system_manager's volume,
		// state-file backups in S3).
		{&pi.PlatformEncryptionKey, key},

		// ── Databases ───────────────────────────────────────────────
		{&pi.PostgresPassword, password},
		{&pi.TimescalePassword, password},
		{&pi.GrafanaDBPassword, password},
		{&pi.GrafanaDatasourcePassword, password},
	}

	if pi.UsePatroniTool {
		secrets = append(secrets,
			// ── Patroni — replication and pg_rewind roles ───────────
			secret{&pi.PostgresReplicatorPassword, password},
			secret{&pi.PostgresRewindPassword, password},
			secret{&pi.TimescaleReplicatorPassword, password},
			secret{&pi.TimescaleRewindPassword, password},

			// ── Patroni — REST API (restapi.authentication) ─────────
			// Guards /switchover, /failover, /restart… on :8008. One
			// per cluster, so one cluster's secret opens only its own.
			secret{&pi.PatroniAdminRestAPIPassword, password},
			secret{&pi.PatroniMetricsRestAPIPassword, password},

			// ── WAL-G ───────────────────────────────────────────────
			// libsodium key encrypting every base backup and WAL
			// segment in S3.
			secret{&pi.WalgLibsodiumKey, key},

			// ── patroni_sidecar ↔ system_manager ────────────────────
			// Shared secret the sidecar checks on every endpoint but
			// /health — see PlatformInfo.PatroniSidecarAPIToken.
			secret{&pi.PatroniSidecarAPIToken, key},
		)
	}

	for _, s := range secrets {
		if force || *s.field == "" {
			*s.field = s.generate()
		}
	}

	// ── Garage (only with S3BucketType "Local Garage") ──────────────
	// The RPC secret and admin/metrics tokens of the platform's Garage,
	// and one S3 key per consumer — WAL-G admin, WAL-G metrics,
	// pipelines, admin_api, system_manager and this CLI:
	//
	//   - access_key_id:     "GK" + 12 random bytes in hex, Garage's
	//                        own format;
	//   - secret_access_key: 32 random bytes in hex.
	//
	// The garage service imports them at start-up (garage-provision in
	// its image) with read+write on the platform's bucket and nothing
	// else. With AWS S3 there is nothing to generate: the bucket's
	// credentials come from the form. See utils.EnsureGarageSecrets.
	utils.EnsureGarageSecrets(pi, force)

	// NATS: the admin user's password and bcrypt hash, and the nkeys of
	// every infrastructure client. Kept in pd.Certs, hence its own
	// helper; always regenerated (InitPlatform does it on every init
	// too), so force makes no difference to it.
	if err := utils.NatsCredentials(pd); err != nil {
		return fmt.Errorf("generating NATS credentials: %w", err)
	}
	return nil
}
