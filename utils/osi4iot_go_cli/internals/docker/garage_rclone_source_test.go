package docker

import (
	"strings"
	"testing"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func TestParseRcloneList(t *testing.T) {
	out := `[
{"Path":"base_000000010000000000000003/tar_partitions/part_1.tar.lz4","Name":"part_1.tar.lz4","Size":1234,"ModTime":"2026-09-30T10:11:12.123456789Z","IsDir":false},
{"Path":"wal_005","Name":"wal_005","Size":0,"ModTime":"2026-09-30T10:11:12Z","IsDir":true},
{"Path":"000000010000000000000004.lz4","Name":"000000010000000000000004.lz4","Size":42,"ModTime":"2026-09-30T10:11:13Z","IsDir":false}
]`
	objects, err := parseRcloneList(out, "backups/patroni_admin")
	if err != nil {
		t.Fatal(err)
	}
	if len(objects) != 2 {
		t.Fatalf("got %d objects, want 2 (directories skipped)", len(objects))
	}
	if objects[0].Key != "backups/patroni_admin/base_000000010000000000000003/tar_partitions/part_1.tar.lz4" {
		t.Fatalf("key not joined onto the prefix: %q", objects[0].Key)
	}
	if objects[0].Size != 1234 || objects[0].ModTime.Year() != 2026 {
		t.Fatalf("size/modtime not parsed: %+v", objects[0])
	}

	if objects, err := parseRcloneList("  ", "x"); err != nil || objects != nil {
		t.Fatalf("empty output: %v %v", objects, err)
	}
	if _, err := parseRcloneList("not json", ""); err == nil {
		t.Fatal("garbage accepted")
	}
}

func TestRcloneEnvUsesGarageRegionAndNoConfigFile(t *testing.T) {
	env := strings.Join(rcloneEnv("http://garage:3900",
		pt.S3Credentials{AccessKeyID: "GKabc", SecretAccessKey: "sec"}), "\n")
	for _, want := range []string{
		"RCLONE_CONFIG_PLAT_TYPE=s3",
		"RCLONE_CONFIG_PLAT_REGION=us-east-1",
		"RCLONE_CONFIG_PLAT_ENDPOINT=http://garage:3900",
		"RCLONE_CONFIG_PLAT_ACCESS_KEY_ID=GKabc",
		"RCLONE_CONFIG_PLAT_FORCE_PATH_STYLE=true",
		"RCLONE_CONFIG_PLAT_NO_CHECK_BUCKET=true",
	} {
		if !strings.Contains(env, want) {
			t.Errorf("missing %s", want)
		}
	}
	if got := rcloneTarget("osi4iot", ""); got != "plat:osi4iot" {
		t.Errorf("bucket root target = %q", got)
	}
	if got := rcloneTarget("osi4iot", "backups/state_file/x.enc"); got != "plat:osi4iot/backups/state_file/x.enc" {
		t.Errorf("object target = %q", got)
	}
}
