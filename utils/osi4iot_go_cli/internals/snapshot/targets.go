package snapshot

import (
	"fmt"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Target names one backed-up component of the platform. The values are
// exactly the ones `osi4iot backup trigger|restore|list` already take,
// so `--include` needs no new vocabulary.
type Target string

const (
	TargetState          Target = "state"
	TargetPatroniAdmin   Target = "patroni_admin"
	TargetPatroniMetrics Target = "patroni_metrics"
	TargetNatsStreams    Target = "nats_streams"

	// TargetOrgData is the platform's own files in the bucket — the
	// glTF models of the digital twins, and whatever else admin_api's
	// S3 folders hold.
	//
	// The odd one out: the others are backups that system_manager
	// produces on a schedule, and this is LIVE data with no catalogue,
	// no chain and nothing to trigger. A snapshot copies it as it is at
	// that moment, and seeding it into a new platform's bucket is the
	// whole of its restore. So `backup trigger` and `backup restore`
	// have nothing to say about it, and `backup snapshot --include`
	// does.
	TargetOrgData Target = "org_data"
)

// AllTargets lists every target, in the order they are written into a
// bundle and, not by coincidence, the order they are seeded and
// restored on the far side: the state file first because everything
// else is described by it, the databases next because the services that
// use them need them up, and the NATS streams last because JetStream
// has to be healthy before a restore into it means anything.
var AllTargets = []Target{
	TargetState,
	TargetPatroniAdmin,
	TargetPatroniMetrics,
	TargetNatsStreams,
	TargetOrgData,
}

// IncludeAll is the token `--include` accepts for "everything", and its
// default value.
const IncludeAll = "all"

// Valid reports whether t is a known target.
func (t Target) Valid() bool {
	for _, known := range AllTargets {
		if t == known {
			return true
		}
	}
	return false
}

func (t Target) String() string { return string(t) }

// Dir is the target's directory inside the archive, with a trailing
// slash. TargetState has no directory of its own — its two files live
// at the fixed paths in doc.go — and Dir returns "" for it.
func (t Target) Dir() string {
	if t == TargetState {
		return ""
	}
	return string(t) + "/"
}

// IsPatroni reports whether t is one of the two wal-g backed clusters,
// which share a catalogue shape and a restore path.
func (t Target) IsPatroni() bool {
	return t == TargetPatroniAdmin || t == TargetPatroniMetrics
}

// OrgDataPrefix is where admin_api keeps the platform's files inside
// the bucket. A plain folder at the bucket root, with no configuration
// field behind it, so it is named here rather than read from the state
// file.
const OrgDataPrefix = "org_data"

// ParseTargets resolves the value of `--include` into a canonical,
// deduplicated, correctly ordered list.
//
// Cobra's StringSlice already splits on commas, but this splits again
// so the function behaves the same whether it is handed
// []string{"a,b"} or []string{"a", "b"} — the difference between
// StringSlice and StringVar is not something a caller should have to
// remember.
//
// An empty list means "all", so a bare `osi4iot backup snapshot` does
// the obvious thing.
func ParseTargets(values []string) ([]Target, error) {
	wanted := make(map[Target]bool)

	for _, value := range values {
		for _, field := range strings.Split(value, ",") {
			field = strings.ToLower(strings.TrimSpace(field))
			if field == "" {
				continue
			}
			if field == IncludeAll {
				return append([]Target(nil), AllTargets...), nil
			}
			target := Target(field)
			if !target.Valid() {
				return nil, fmt.Errorf("unknown target %q (expected %s, or %q)",
					field, JoinTargets(AllTargets, ", "), IncludeAll)
			}
			wanted[target] = true
		}
	}

	if len(wanted) == 0 {
		return append([]Target(nil), AllTargets...), nil
	}

	// Iterate AllTargets rather than the map so the result is ordered
	// and stable regardless of how the operator typed the flag.
	var targets []Target
	for _, target := range AllTargets {
		if wanted[target] {
			targets = append(targets, target)
		}
	}
	return targets, nil
}

// Contains reports whether targets includes t.
func Contains(targets []Target, t Target) bool {
	for _, target := range targets {
		if target == t {
			return true
		}
	}
	return false
}

// JoinTargets renders a target list for help and error text.
func JoinTargets(targets []Target, sep string) string {
	parts := make([]string, len(targets))
	for i, target := range targets {
		parts[i] = string(target)
	}
	return strings.Join(parts, sep)
}

// SourcePrefix returns the "s3://bucket/prefix" the platform stores
// this target's backups under, as recorded in the state file, or "" if
// the feature is not configured.
//
// Recorded in the manifest so the far side can tell what it is
// remapping FROM: a bundle taken from a platform whose prefixes differ
// from the new one's is fine, but silently is the wrong way to do it.
func SourcePrefix(pd *pt.PlatformData, t Target) string {
	if pd == nil {
		return ""
	}
	switch t {
	case TargetState:
		return pd.PlatformInfo.StateFileS3Prefix
	case TargetNatsStreams:
		return pd.PlatformInfo.NATSBackupS3Prefix
	case TargetPatroniAdmin:
		return pd.PlatformInfo.WalgS3PrefixAdmin
	case TargetPatroniMetrics:
		return pd.PlatformInfo.WalgS3PrefixMetrics
	case TargetOrgData:
		// Built rather than read: unlike the backup prefixes, this one
		// is not configurable, so the bucket name is all there is.
		if pd.PlatformInfo.S3BucketName == "" {
			return ""
		}
		return "s3://" + pd.PlatformInfo.S3BucketName + "/" + OrgDataPrefix
	}
	return ""
}