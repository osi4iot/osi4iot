package docker

import (
	"context"
	"fmt"
	"log"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// The clusters of a wal-g archive.
//
// Each cluster of a family (patroni_admin, patroni_metrics) archives in
// its own folder of the family's prefix, named after its PostgreSQL
// system identifier: WALG_S3_PREFIX/<system identifier>. The image's
// walg-scoped puts every wal-g call there. A cluster created from
// scratch — its volumes lost — gets a new identifier and so a new,
// empty folder, instead of reading the archive of the cluster before it
// (which left it without a leader: its nodes followed the old cluster's
// timelines and stopped at "could not locate a valid checkpoint
// record").
//
// The backups stored before those folders existed stay in the bare
// prefix: the "legacy" cluster here. They can still be listed, restored
// and snapshotted; retention never deletes them.

// LegacyWalgCluster names the backups stored in the bare prefix.
const LegacyWalgCluster = "legacy"

// newClusterAge is how young a running cluster has to be to count as
// one bootstrapped empty after its data was lost: then a restore that
// names no cluster takes the newest backup of another one.
const newClusterAge = 48 * time.Hour

// WalgCluster is one cluster's folder of the archive.
type WalgCluster struct {
	// Folder is the system identifier, "" for the legacy backups.
	Folder string
	// SystemIdentifier is Folder as a number, 0 for legacy.
	SystemIdentifier uint64
	// Backups are the completed base backups, newest first.
	Backups []WalgStoredBackup
}

// WalgStoredBackup is a completed base backup, as its sentinel shows it.
type WalgStoredBackup struct {
	Name string
	Time time.Time
}

// Label is how the operator names the cluster: its system identifier,
// or "legacy".
func (c WalgCluster) Label() string {
	if c.Folder == "" {
		return LegacyWalgCluster
	}
	return c.Folder
}

// Prefix is where the cluster's archive is, under the family's prefix.
func (c WalgCluster) Prefix(base string) string {
	base = strings.TrimSuffix(base, "/")
	if c.Folder == "" {
		return base
	}
	return base + "/" + c.Folder
}

// Newest is the time of its newest backup (zero when it has none).
func (c WalgCluster) Newest() time.Time {
	if len(c.Backups) == 0 {
		return time.Time{}
	}
	return c.Backups[0].Time
}

func (c WalgCluster) hasBackup(name string) bool {
	for _, b := range c.Backups {
		if b.Name == name {
			return true
		}
	}
	return false
}

// InitTime is when the cluster was created: PostgreSQL builds the
// system identifier from initdb's time, in seconds, in its upper 32
// bits. Zero for legacy.
func (c WalgCluster) InitTime() time.Time {
	return systemIdentifierTime(c.SystemIdentifier)
}

func systemIdentifierTime(id uint64) time.Time {
	if id == 0 {
		return time.Time{}
	}
	return time.Unix(int64(id>>32), 0).UTC()
}

var (
	sysidFolder = regexp.MustCompile(`^[0-9]{6,20}$`)
)

// clustersFromObjects groups the backup sentinels under keyPrefix by the
// cluster folder they are in. Pure, for the tests.
func clustersFromObjects(keyPrefix string, objects []s3Object) []WalgCluster {
	root := strings.Trim(keyPrefix, "/")
	if root != "" {
		root += "/"
	}
	byFolder := map[string]*WalgCluster{}
	for _, object := range objects {
		relative := strings.TrimPrefix(object.Key, root)
		if relative == object.Key && root != "" {
			continue
		}
		base := path.Base(relative)
		if !strings.HasSuffix(base, walgSentinelSuffix) {
			continue
		}
		dir := path.Dir(relative) // basebackups_005, or <sysid>/basebackups_005
		folder := ""
		switch {
		case dir == walgBaseBackupsDir:
		case path.Base(dir) == walgBaseBackupsDir && sysidFolder.MatchString(path.Dir(dir)):
			folder = path.Dir(dir)
		default:
			continue
		}
		cluster, ok := byFolder[folder]
		if !ok {
			cluster = &WalgCluster{Folder: folder}
			if folder != "" {
				cluster.SystemIdentifier, _ = strconv.ParseUint(folder, 10, 64)
			}
			byFolder[folder] = cluster
		}
		cluster.Backups = append(cluster.Backups, WalgStoredBackup{
			Name: strings.TrimSuffix(base, walgSentinelSuffix),
			Time: object.ModTime,
		})
	}

	clusters := make([]WalgCluster, 0, len(byFolder))
	for _, c := range byFolder {
		sort.Slice(c.Backups, func(i, j int) bool { return c.Backups[i].Time.After(c.Backups[j].Time) })
		clusters = append(clusters, *c)
	}
	// newest backup first
	sort.Slice(clusters, func(i, j int) bool { return clusters[i].Newest().After(clusters[j].Newest()) })
	return clusters
}

// listWalgClusters reads the clusters of one family's archive from S3:
// the completed base backups (their sentinels) of every folder.
func listWalgClusters(ctx context.Context, store *PlatformS3, s3Prefix string) ([]WalgCluster, error) {
	if s3Prefix == "" {
		return nil, nil
	}
	bucket, keyPrefix, err := ParseS3Prefix(s3Prefix)
	if err != nil {
		return nil, err
	}
	objects, err := store.List(ctx, bucket, strings.Trim(keyPrefix, "/")+"/")
	if err != nil {
		return nil, err
	}
	return clustersFromObjects(keyPrefix, objects), nil
}

// RestoreSource is the archive a restore reads, and why that one.
type RestoreSource struct {
	Cluster WalgCluster
	// Prefix is the cluster's archive: what the restore gives the nodes
	// in PATRONI_RESTORE_PREFIX.
	Prefix string
	// Backup is what wal-g fetches: a name, or LATEST (in that folder).
	Backup string
	// Reason says, for the operator, why this cluster.
	Reason string
	// Others are the clusters not chosen that hold backups.
	Others []WalgCluster
	// LiveSystemIdentifier is the running cluster's, 0 when unknown.
	LiveSystemIdentifier uint64
}

// SameAsLive says whether the restore reads the running cluster's own
// archive: only then is there unarchived WAL of it worth flushing first.
func (s RestoreSource) SameAsLive() bool {
	return s.LiveSystemIdentifier != 0 && s.Cluster.SystemIdentifier == s.LiveSystemIdentifier
}

// chooseRestoreCluster picks the cluster a restore reads. Pure, for the
// tests.
//
//   - want names it: a system identifier, or "legacy".
//   - Otherwise a backup name finds it: the one cluster that has it.
//   - Otherwise (LATEST) the cluster with the newest backup — leaving
//     out the running cluster when it is younger than newClusterAge and
//     another cluster has backups: that is a cluster bootstrapped empty
//     after its data was lost, and restoring its own (empty) backups is
//     not what anybody wants.
func chooseRestoreCluster(clusters []WalgCluster, want, backup string, live uint64, now time.Time) (WalgCluster, string, error) {
	withBackups := make([]WalgCluster, 0, len(clusters))
	for _, c := range clusters {
		if len(c.Backups) > 0 {
			withBackups = append(withBackups, c)
		}
	}
	labels := func(list []WalgCluster) string {
		names := make([]string, 0, len(list))
		for _, c := range list {
			names = append(names, c.Label())
		}
		return strings.Join(names, ", ")
	}
	if len(withBackups) == 0 {
		return WalgCluster{}, "", fmt.Errorf("the archive has no completed backups")
	}
	named := backup != "" && !strings.EqualFold(backup, "LATEST")

	if want != "" {
		for _, c := range withBackups {
			if c.Label() == want {
				if named && !c.hasBackup(backup) {
					return WalgCluster{}, "", fmt.Errorf("cluster %s has no backup %s", want, backup)
				}
				return c, "chosen with --cluster", nil
			}
		}
		return WalgCluster{}, "", fmt.Errorf("the archive has no cluster %s with backups (it has: %s)", want, labels(withBackups))
	}

	if named {
		var holders []WalgCluster
		for _, c := range withBackups {
			if c.hasBackup(backup) {
				holders = append(holders, c)
			}
		}
		switch len(holders) {
		case 0:
			return WalgCluster{}, "", fmt.Errorf("no cluster of the archive has a backup %s", backup)
		case 1:
			return holders[0], "the cluster that has backup " + backup, nil
		default:
			return WalgCluster{}, "", fmt.Errorf("backup %s is in more than one cluster (%s): choose one with --cluster",
				backup, labels(holders))
		}
	}

	candidates := withBackups
	reason := "the newest backup"
	if live != 0 && len(withBackups) > 1 {
		liveInit := systemIdentifierTime(live)
		if now.Sub(liveInit) < newClusterAge {
			others := make([]WalgCluster, 0, len(withBackups))
			for _, c := range withBackups {
				if c.SystemIdentifier != live {
					others = append(others, c)
				}
			}
			if len(others) > 0 && len(others) < len(withBackups) {
				candidates = others
				reason = fmt.Sprintf("the newest backup of a cluster other than the running one, created %s "+
					"(bootstrapped empty after its data was lost)", liveInit.Local().Format("2006-01-02 15:04"))
			}
		}
	}
	// clusters arrive newest backup first
	return candidates[0], reason, nil
}

// ResolvePatroniRestoreSource reads the family's archive and decides
// which cluster a restore reads (see chooseRestoreCluster). Called
// before the confirmation, so the operator sees it.
func ResolvePatroniRestoreSource(pd *pt.PlatformData, dc *pt.DockerClient, target string, opts PatroniRestoreOptions, logger *log.Logger) (RestoreSource, error) {
	family := patroniAdminFamily
	base := pd.PlatformInfo.WalgS3PrefixAdmin
	if target == "patroni_metrics" {
		family = patroniMetricsFamily
		base = pd.PlatformInfo.WalgS3PrefixMetrics
	}
	if base == "" {
		return RestoreSource{}, fmt.Errorf("%s backups are not configured: its WALG_S3_PREFIX is empty", target)
	}

	ctx := context.Background()
	store, err := OpenPlatformS3(ctx, pd, dc, "", logger)
	if err != nil {
		return RestoreSource{}, fmt.Errorf("error opening the object store: %w", err)
	}
	defer store.Close()

	clusters, err := listWalgClusters(ctx, store, base)
	if err != nil {
		return RestoreSource{}, fmt.Errorf("error listing %s's archive: %w", target, err)
	}

	var live uint64
	if leader, err := queryPatroniLeader(pd, dc, family); err == nil && leader != "" {
		if id, err := livePatroniSystemIdentifier(leader); err == nil {
			live = id
		}
	}

	cluster, reason, err := chooseRestoreCluster(clusters, opts.Cluster, opts.Backup, live, time.Now())
	if err != nil {
		return RestoreSource{}, fmt.Errorf("%s: %w", target, err)
	}
	backup := opts.Backup
	if backup == "" {
		backup = "LATEST"
	}
	source := RestoreSource{
		Cluster:              cluster,
		Prefix:               cluster.Prefix(base),
		Backup:               backup,
		Reason:               reason,
		LiveSystemIdentifier: live,
	}
	for _, c := range clusters {
		if c.Folder != cluster.Folder && len(c.Backups) > 0 {
			source.Others = append(source.Others, c)
		}
	}
	return source, nil
}

// ListPatroniArchiveClusters returns every cluster of a family's archive
// with its backups, newest backup first, and the running cluster's
// system identifier (0 when unknown). For `osi4iot backup list`.
func ListPatroniArchiveClusters(pd *pt.PlatformData, dc *pt.DockerClient, target string, logger *log.Logger) ([]WalgCluster, uint64, error) {
	family := patroniAdminFamily
	base := pd.PlatformInfo.WalgS3PrefixAdmin
	if target == "patroni_metrics" {
		family = patroniMetricsFamily
		base = pd.PlatformInfo.WalgS3PrefixMetrics
	}
	ctx := context.Background()
	store, err := OpenPlatformS3(ctx, pd, dc, "", logger)
	if err != nil {
		return nil, 0, fmt.Errorf("error opening the object store: %w", err)
	}
	defer store.Close()
	clusters, err := listWalgClusters(ctx, store, base)
	if err != nil {
		return nil, 0, err
	}
	var live uint64
	if leader, err := queryPatroniLeader(pd, dc, family); err == nil && leader != "" {
		if id, err := livePatroniSystemIdentifier(leader); err == nil {
			live = id
		}
	}
	return clusters, live, nil
}

// SnapshotRestoreCluster is the cluster a snapshot's backups are seeded
// into, from the prefix the snapshot recorded: a cluster folder, or the
// bare prefix (legacy) for snapshots taken before folders existed.
func SnapshotRestoreCluster(recordedPrefix string) string {
	last := path.Base(strings.TrimSuffix(recordedPrefix, "/"))
	if sysidFolder.MatchString(last) {
		return last
	}
	return LegacyWalgCluster
}
