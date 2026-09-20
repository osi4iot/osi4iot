package snapshot

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Manifest is the index of a bundle: what is inside, where it came
// from, and enough context to decide whether it can be restored here
// before anything is written.
//
// It is the last entry written and the first one read. Everything a
// consumer needs to plan the restore — which objects exist, which
// wal-g backup to bootstrap from, which PostgreSQL major wrote it — is
// in here, so no consumer has to walk the archive to find out.
type Manifest struct {
	FormatVersion int       `json:"format_version"`
	CreatedAt     time.Time `json:"created_at"`
	CLIVersion    string    `json:"cli_version"`

	// StateEncrypted is false only when the bundle was written by a CLI
	// running with --no-encrypt, in which case state/osi4iot_state.json
	// is plaintext JSON and the bundle must be treated as a secret in
	// its entirety.
	StateEncrypted bool `json:"state_encrypted"`

	Platform PlatformSummary `json:"platform"`
	Source   Source          `json:"source"`

	// Targets holds one entry per included target. A target present
	// with no entries is meaningful and is not an error: it says the
	// snapshot looked and found nothing stored yet.
	Targets map[Target]*TargetManifest `json:"targets"`
}

// PlatformSummary identifies the platform the bundle came from, in
// plain text, so `osi4iot init --snapshot-file` can show the operator
// what they are about to stand up before asking for the passphrase.
//
// Everything here is already public-ish (a domain name, a deployment
// shape). No credential belongs in this struct: it is readable by
// anyone holding the zip.
type PlatformSummary struct {
	Name                string `json:"name"`
	Domain              string `json:"domain"`
	DeploymentLocation  string `json:"deployment_location"`
	DeploymentMode      string `json:"deployment_mode,omitempty"`
	NumberOfSwarmNodes  int    `json:"number_of_swarm_nodes"`
	UsePatroniTool      bool   `json:"use_patroni_tool"`
	DockerImagesVersion string `json:"docker_images_version,omitempty"`
}

// Source describes the object store the bundle was drained from.
//
// Worth recording because the two cases behave very differently on the
// far side: with "Local Minio" the objects have to be seeded into a
// brand new, empty bucket, while with AWS S3 the new platform may be
// pointed at the very same bucket — in which case nothing needs seeding
// and the real risk is two platforms writing to one wal-g prefix.
type Source struct {
	BucketType    string `json:"bucket_type"`
	Bucket        string `json:"bucket"`
	MinioEndpoint string `json:"minio_endpoint,omitempty"`
}

// TargetManifest is one target's slice of the bundle.
type TargetManifest struct {
	// Prefix is the "s3://bucket/prefix" this target's objects were
	// read from. ObjectKey in each Entry is relative to it.
	Prefix string `json:"prefix,omitempty"`

	// Run is the NATS backup run the entries belong to
	// ("20260915T101500Z"), empty for other targets.
	Run string `json:"run,omitempty"`

	// StreamCount is how many JetStream streams the run contains. A run
	// with fewer streams than its siblings is the visible signature of
	// a backup interrupted partway through, which is exactly what a
	// restore must not swallow silently.
	StreamCount int `json:"stream_count,omitempty"`

	// Backups is the wal-g chain carried for a Patroni target, BASE
	// FIRST and newest last, so Backups[0] is the full backup and
	// Backups[len-1] is what a restore should bootstrap from. See
	// RestoreBackupName.
	Backups []PatroniBackupRef `json:"backups,omitempty"`

	// PgVersion is wal-g's server version number (180000 for 18.0).
	// Restoring across PostgreSQL majors does not work, so the far side
	// checks this before it starts.
	PgVersion int `json:"pg_version,omitempty"`

	// CompressionMethod is WALG_COMPRESSION_METHOD at the time of the
	// backup. wal-g cannot fetch a backup written with a different one,
	// so the new platform's state file has to agree with this.
	CompressionMethod string `json:"compression_method,omitempty"`

	Entries []Entry `json:"entries"`
	Bytes   int64   `json:"bytes"`
}

// PatroniBackupRef is one link of a wal-g chain, carrying just enough
// to verify the chain is whole without asking wal-g again.
type PatroniBackupRef struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"` // "full" or "delta"
	ParentName string `json:"parent_name,omitempty"`
	Time       string `json:"time,omitempty"`
}

// Entry is one stored object.
type Entry struct {
	// ZipPath is where the bytes live inside the archive.
	ZipPath string `json:"zip_path"`

	// ObjectKey is the key relative to the target's prefix, which is
	// what the far side re-uploads under ITS prefix. Keeping it
	// relative is what makes a bundle taken from one prefix restorable
	// into another.
	ObjectKey string `json:"object_key"`

	Size    int64     `json:"size"`
	SHA256  string    `json:"sha256"`
	ModTime time.Time `json:"mod_time,omitempty"`
}

// NewManifest starts a manifest for a bundle about to be written.
// Targets are added as they are filled in; see Writer.
func NewManifest(cliVersion string, pd *pt.PlatformData, stateEncrypted bool) *Manifest {
	return &Manifest{
		FormatVersion:  FormatVersion,
		CreatedAt:      time.Now().UTC(),
		CLIVersion:     cliVersion,
		StateEncrypted: stateEncrypted,
		Platform:       SummarizePlatform(pd),
		Source:         SummarizeSource(pd),
		Targets:        make(map[Target]*TargetManifest),
	}
}

// SummarizePlatform lifts the non-secret identifying fields out of the
// state file.
func SummarizePlatform(pd *pt.PlatformData) PlatformSummary {
	if pd == nil {
		return PlatformSummary{}
	}
	pi := pd.PlatformInfo
	return PlatformSummary{
		Name:                pi.PlatformName,
		Domain:              pi.DomainName,
		DeploymentLocation:  pi.DeploymentLocation,
		DeploymentMode:      pi.DeploymentMode,
		NumberOfSwarmNodes:  pi.NumberOfSwarmNodes,
		UsePatroniTool:      pi.UsePatroniTool,
		DockerImagesVersion: pi.DockerImagesVersion,
	}
}

// SummarizeSource records where the objects were read from. The bucket
// credentials are deliberately NOT included: they are in the state
// file, where they are encrypted.
func SummarizeSource(pd *pt.PlatformData) Source {
	if pd == nil {
		return Source{}
	}
	return Source{
		BucketType:    pd.PlatformInfo.S3BucketType,
		Bucket:        pd.PlatformInfo.S3BucketName,
		MinioEndpoint: pd.PlatformInfo.MinioEndpoint,
	}
}

// EnsureTarget returns t's section, creating it if this is the first
// time the target is touched.
func (m *Manifest) EnsureTarget(t Target) *TargetManifest {
	if m.Targets == nil {
		m.Targets = make(map[Target]*TargetManifest)
	}
	if existing, ok := m.Targets[t]; ok {
		return existing
	}
	tm := &TargetManifest{}
	m.Targets[t] = tm
	return tm
}

// Target returns t's section, or nil when the bundle does not include
// it.
func (m *Manifest) Target(t Target) *TargetManifest {
	if m.Targets == nil {
		return nil
	}
	return m.Targets[t]
}

// Has reports whether the bundle includes t at all.
func (m *Manifest) Has(t Target) bool { return m.Target(t) != nil }

// IncludedTargets lists what the bundle carries, in AllTargets order.
func (m *Manifest) IncludedTargets() []Target {
	var included []Target
	for _, target := range AllTargets {
		if m.Has(target) {
			included = append(included, target)
		}
	}
	return included
}

// TotalBytes is the uncompressed size of every object entry.
func (m *Manifest) TotalBytes() int64 {
	var total int64
	for _, tm := range m.Targets {
		total += tm.Bytes
	}
	return total
}

// RestoreBackupName is the wal-g backup a restore should bootstrap
// from: the newest link of the chain, which is the last one. Empty when
// the target carries no catalogue.
func (tm *TargetManifest) RestoreBackupName() string {
	if len(tm.Backups) == 0 {
		return ""
	}
	return tm.Backups[len(tm.Backups)-1].Name
}

// BaseBackupName is the full backup every delta in the chain descends
// from, which is the first link.
func (tm *TargetManifest) BaseBackupName() string {
	if len(tm.Backups) == 0 {
		return ""
	}
	return tm.Backups[0].Name
}

// Validate checks a manifest read from an archive for the problems that
// would otherwise surface halfway through a restore.
//
// It checks the SHAPE of the manifest, not the bytes: verifying entries
// against their checksums means reading the whole archive, which is
// Reader.Verify's job and the caller's choice.
func (m *Manifest) Validate() error {
	if m.FormatVersion == 0 {
		return fmt.Errorf("this does not look like an osi4iot snapshot: the manifest has no format version")
	}
	if m.FormatVersion > FormatVersion {
		return fmt.Errorf("this snapshot was written in format version %d and this CLI understands "+
			"up to version %d: upgrade osi4iot to read it", m.FormatVersion, FormatVersion)
	}
	if m.Platform.Domain == "" {
		return fmt.Errorf("the manifest has no domain name in it: it does not look like an osi4iot snapshot")
	}

	for _, target := range m.IncludedTargets() {
		tm := m.Target(target)

		seenZipPaths := make(map[string]bool)
		for i, entry := range tm.Entries {
			switch {
			case entry.ZipPath == "":
				return fmt.Errorf("%s entry %d has no path inside the archive", target, i)
			case entry.ObjectKey == "":
				return fmt.Errorf("%s entry %d (%s) has no object key", target, i, entry.ZipPath)
			case entry.SHA256 == "":
				return fmt.Errorf("%s entry %d (%s) has no checksum", target, i, entry.ObjectKey)
			case !strings.HasPrefix(entry.ZipPath, target.Dir()):
				return fmt.Errorf("%s entry %q is filed under the wrong target", target, entry.ZipPath)
			case seenZipPaths[entry.ZipPath]:
				return fmt.Errorf("%s lists %q twice", target, entry.ZipPath)
			}
			seenZipPaths[entry.ZipPath] = true
		}

		if !target.IsPatroni() {
			continue
		}

		// A delta whose parent is missing cannot be restored, and that
		// is a property of the SET, so it is checked here rather than
		// per entry. The chain is base first, so every parent must have
		// been seen already.
		seenChainNames := make(map[string]bool)
		for i, backup := range tm.Backups {
			if backup.Name == "" {
				return fmt.Errorf("%s backup %d has no name", target, i)
			}
			if i == 0 && backup.Kind == "delta" {
				return fmt.Errorf("%s chain starts with delta %s: its base backup is missing, "+
					"so this snapshot cannot be restored", target, backup.Name)
			}
			if backup.ParentName != "" && !seenChainNames[backup.ParentName] {
				return fmt.Errorf("%s backup %s depends on %s, which is not in this snapshot",
					target, backup.Name, backup.ParentName)
			}
			seenChainNames[backup.Name] = true
		}
		if len(tm.Backups) > 0 && len(tm.Entries) == 0 {
			return fmt.Errorf("%s lists %d backup(s) but carries no objects",
				target, len(tm.Backups))
		}
	}

	return nil
}

// CheckRestorable reports whether the bundle can drive
// `osi4iot init --snapshot-file`, which needs the state file above all
// else: without it there is no domain, no credentials and no wal-g key,
// and therefore nothing the rest of the archive can be decrypted into.
func (m *Manifest) CheckRestorable() error {
	if err := m.Validate(); err != nil {
		return err
	}
	if !m.Has(TargetState) {
		return fmt.Errorf("this snapshot was taken without the state file "+
			"(--include %s), so it cannot initialise a platform on its own. "+
			"Use it with 'osi4iot backup restore' on a platform that already exists",
			JoinTargets(m.IncludedTargets(), ","))
	}
	return nil
}

// Describe renders the manifest for a human about to act on it: what
// platform, taken when, carrying what. Used by both the confirmation
// prompt of `init --snapshot-file` and a future `backup snapshot
// --inspect`.
func (m *Manifest) Describe() string {
	var b strings.Builder

	fmt.Fprintf(&b, "Platform:  %s (%s)\n", m.Platform.Name, m.Platform.Domain)
	fmt.Fprintf(&b, "Taken:     %s by osi4iot %s\n",
		m.CreatedAt.Local().Format(time.RFC1123), m.CLIVersion)
	fmt.Fprintf(&b, "Layout:    %s, %d node(s)\n",
		m.Platform.DeploymentLocation, m.Platform.NumberOfSwarmNodes)
	fmt.Fprintf(&b, "Objects:   %s across %d target(s)\n",
		humanBytes(m.TotalBytes()), len(m.IncludedTargets()))

	if !m.StateEncrypted {
		b.WriteString("\n  WARNING: the state file in this snapshot is NOT encrypted.\n" +
			"  It holds every credential the platform has. Treat the whole file as a secret.\n")
	}

	for _, target := range m.IncludedTargets() {
		tm := m.Target(target)
		fmt.Fprintf(&b, "\n  %s\n", target)
		switch {
		case target == TargetState:
			fmt.Fprintf(&b, "    the platform state file\n")
		case target == TargetNatsStreams:
			if tm.Run == "" {
				fmt.Fprintf(&b, "    nothing stored yet\n")
				break
			}
			fmt.Fprintf(&b, "    run %s, %d stream(s), %s\n",
				tm.Run, tm.StreamCount, humanBytes(tm.Bytes))
		case target.IsPatroni():
			if len(tm.Entries) == 0 {
				fmt.Fprintf(&b, "    nothing stored yet\n")
				break
			}
			fmt.Fprintf(&b, "    %d object(s), %s\n", len(tm.Entries), humanBytes(tm.Bytes))
			if name := tm.RestoreBackupName(); name != "" {
				fmt.Fprintf(&b, "    restores from %s", name)
				if len(tm.Backups) > 1 {
					fmt.Fprintf(&b, " (chain of %d, base %s)", len(tm.Backups), tm.BaseBackupName())
				}
				b.WriteString("\n")
			}
			if tm.PgVersion != 0 {
				fmt.Fprintf(&b, "    PostgreSQL %s, wal-g compression %s\n",
					formatPgVersion(tm.PgVersion), tm.CompressionMethod)
			}
		default:
			if len(tm.Entries) == 0 {
				fmt.Fprintf(&b, "    nothing stored yet\n")
				break
			}
			fmt.Fprintf(&b, "    %d file(s), %s\n", len(tm.Entries), humanBytes(tm.Bytes))
		}
	}

	return b.String()
}

// sortEntries keeps the entries in a stable order so two snapshots of
// the same objects produce byte-identical manifests, which makes them
// diffable and makes a bundle reproducible enough to compare.
func (m *Manifest) sortEntries() {
	for _, tm := range m.Targets {
		sort.Slice(tm.Entries, func(i, j int) bool {
			return tm.Entries[i].ObjectKey < tm.Entries[j].ObjectKey
		})
	}
}

// encode renders the manifest as indented JSON, ready to be written as
// the archive's last entry.
func (m *Manifest) encode() ([]byte, error) {
	m.sortEntries()
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("error serialising the manifest: %w", err)
	}
	return append(data, '\n'), nil
}

// decodeManifest parses a manifest read out of an archive.
func decodeManifest(data []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("the manifest is not valid JSON: %w", err)
	}
	return &m, nil
}

// formatPgVersion turns wal-g's server version number into a major.
// Mirrors cmd/backup_commands.go, kept here so this package stays
// importable on its own.
func formatPgVersion(v int) string {
	if v >= 100000 {
		return fmt.Sprintf("%d", v/10000)
	}
	return fmt.Sprintf("%d", v)
}

func humanBytes(n int64) string {
	if n <= 0 {
		return "0 B"
	}
	const unit = 1024.0
	value := float64(n)
	for _, suffix := range []string{"B", "KiB", "MiB", "GiB", "TiB"} {
		if value < unit {
			return fmt.Sprintf("%.0f %s", value, suffix)
		}
		value /= unit
	}
	return fmt.Sprintf("%.1f PiB", value)
}