package docker

import (
	"strings"
	"testing"
	"time"
)

// a system identifier as initdb makes it: its time in the upper 32 bits
func sysidAt(t time.Time, low uint32) uint64 { return uint64(t.Unix())<<32 | uint64(low) }

func TestClustersFromObjects(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 11, d, 1, 0, 0, 0, time.UTC) }
	objects := []s3Object{
		// legacy (the bare prefix), from before cluster folders
		{Key: "walg_metrics/basebackups_005/base_000000010000000000000003_backup_stop_sentinel.json", ModTime: day(8)},
		{Key: "walg_metrics/basebackups_005/base_0000002400000002000000C7_backup_stop_sentinel.json", ModTime: day(14)},
		{Key: "walg_metrics/basebackups_005/base_0000002400000002000000C7/tar_partitions/part_1.tar.lz4", ModTime: day(14)},
		{Key: "walg_metrics/wal_005/000000010000000000000003.lz4", ModTime: day(8)},
		// a cluster folder
		{Key: "walg_metrics/7711111954756448475/basebackups_005/base_000000010000000000000002_backup_stop_sentinel.json", ModTime: day(22)},
		{Key: "walg_metrics/7711111954756448475/wal_005/000000010000000000000002.lz4", ModTime: day(22)},
		// not a cluster folder, not this prefix
		{Key: "walg_metrics/notes/basebackups_005/x_backup_stop_sentinel.json", ModTime: day(23)},
		{Key: "walg_admin/basebackups_005/y_backup_stop_sentinel.json", ModTime: day(23)},
	}
	clusters := clustersFromObjects("walg_metrics", objects)
	if len(clusters) != 2 {
		t.Fatalf("clusters = %+v", clusters)
	}
	if clusters[0].Label() != "7711111954756448475" || clusters[0].SystemIdentifier != 7711111954756448475 {
		t.Fatalf("newest first: %+v", clusters[0])
	}
	legacy := clusters[1]
	if legacy.Label() != LegacyWalgCluster || len(legacy.Backups) != 2 || legacy.Backups[0].Name != "base_0000002400000002000000C7" {
		t.Fatalf("legacy = %+v", legacy)
	}
	if got := legacy.Prefix("s3://b/walg_metrics/"); got != "s3://b/walg_metrics" {
		t.Fatalf("legacy prefix = %s", got)
	}
	if got := clusters[0].Prefix("s3://b/walg_metrics"); got != "s3://b/walg_metrics/7711111954756448475" {
		t.Fatalf("cluster prefix = %s", got)
	}
}

func TestChooseRestoreCluster(t *testing.T) {
	now := time.Date(2026, 11, 22, 23, 0, 0, 0, time.UTC)
	old := sysidAt(time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), 7)
	young := sysidAt(now.Add(-2*time.Hour), 9)
	mk := func(id uint64, newest time.Time, names ...string) WalgCluster {
		c := WalgCluster{SystemIdentifier: id}
		if id != 0 {
			c.Folder = uitoa(id)
		}
		for i, n := range names {
			c.Backups = append(c.Backups, WalgStoredBackup{Name: n, Time: newest.Add(-time.Duration(i) * time.Hour)})
		}
		return c
	}
	oldCluster := mk(old, now.Add(-3*24*time.Hour), "base_old_2", "base_old_1")
	youngCluster := mk(young, now.Add(-time.Hour), "base_young")
	legacy := mk(0, now.Add(-8*24*time.Hour), "base_legacy", "base_shared")
	clusters := []WalgCluster{youngCluster, oldCluster, legacy} // newest backup first

	// the running cluster was just created: its own backups are left out
	c, reason, err := chooseRestoreCluster(clusters, "", "LATEST", young, now)
	if err != nil || c.SystemIdentifier != old || !strings.Contains(reason, "other than the running one") {
		t.Fatalf("young live: %v %q %v", c.Label(), reason, err)
	}
	// an established running cluster: its newest backup
	established := sysidAt(now.Add(-10*24*time.Hour), 3)
	c, _, err = chooseRestoreCluster([]WalgCluster{mk(established, now.Add(-time.Hour), "b"), oldCluster}, "", "", established, now)
	if err != nil || c.SystemIdentifier != established {
		t.Fatalf("established live: %v %v", c.Label(), err)
	}
	// only the young cluster has backups: it is still the one
	c, _, err = chooseRestoreCluster([]WalgCluster{youngCluster}, "", "", young, now)
	if err != nil || c.SystemIdentifier != young {
		t.Fatalf("only young: %v %v", c.Label(), err)
	}
	// named
	c, _, err = chooseRestoreCluster(clusters, "legacy", "", young, now)
	if err != nil || c.Folder != "" {
		t.Fatalf("--cluster legacy: %+v %v", c, err)
	}
	if _, _, err = chooseRestoreCluster(clusters, "123", "", young, now); err == nil {
		t.Fatal("an unknown cluster must fail")
	}
	if _, _, err = chooseRestoreCluster(clusters, "legacy", "base_young", young, now); err == nil {
		t.Fatal("a backup the cluster does not have must fail")
	}
	// by backup name
	c, _, err = chooseRestoreCluster(clusters, "", "base_old_1", 0, now)
	if err != nil || c.SystemIdentifier != old {
		t.Fatalf("by name: %v %v", c.Label(), err)
	}
	twice := mk(old, now, "base_shared")
	if _, _, err = chooseRestoreCluster([]WalgCluster{twice, legacy}, "", "base_shared", 0, now); err == nil || !strings.Contains(err.Error(), "--cluster") {
		t.Fatalf("a name in two clusters must ask for --cluster: %v", err)
	}
	if _, _, err = chooseRestoreCluster(nil, "", "", 0, now); err == nil {
		t.Fatal("an empty archive must fail")
	}
}

func TestSnapshotRestoreCluster(t *testing.T) {
	if got := SnapshotRestoreCluster("s3://b/walg_metrics/7711111954756448475"); got != "7711111954756448475" {
		t.Fatal(got)
	}
	if got := SnapshotRestoreCluster("s3://b/walg_metrics/"); got != LegacyWalgCluster {
		t.Fatal(got)
	}
}

func TestSystemIdentifierTime(t *testing.T) {
	at := time.Date(2026, 11, 22, 21, 30, 0, 0, time.UTC)
	if got := systemIdentifierTime(sysidAt(at, 12345)); !got.Equal(at) {
		t.Fatal(got)
	}
}

func uitoa(v uint64) string {
	if v == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	return string(b[i:])
}
