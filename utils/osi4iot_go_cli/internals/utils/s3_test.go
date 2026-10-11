package utils

import (
	"os"
	"regexp"
	"strings"
	"testing"

	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func garagePI() osi_types.PlatformInfo {
	return osi_types.PlatformInfo{S3BucketType: S3BucketTypeGarage, S3BucketName: "osi4iot"}
}

func TestS3RegionIsUniformForGarage(t *testing.T) {
	pi := garagePI()
	// Whatever the form left behind, Garage clients sign for us-east-1.
	for _, leftover := range []string{"", "Europe (Paris)", "eu-west-3"} {
		pi.AWSRegionS3Bucket = leftover
		if got := S3Region(pi); got != "us-east-1" {
			t.Fatalf("Garage region with %q = %q, want us-east-1", leftover, got)
		}
	}
	if !strings.Contains(GarageConfigToml(pi), `s3_region = "us-east-1"`) {
		t.Fatal("garage.toml does not configure s3_region = us-east-1")
	}
}

func TestS3RegionAWSKeepsBucketRegion(t *testing.T) {
	pi := osi_types.PlatformInfo{S3BucketType: S3BucketTypeAWS, AWSRegionS3Bucket: "Europe (Paris)"}
	if got := S3Region(pi); got != "eu-west-3" {
		t.Fatalf("AWS region = %q, want eu-west-3 (label translated to code)", got)
	}
	pi.AWSRegionS3Bucket = ""
	if got := S3Region(pi); got != "us-east-1" {
		t.Fatalf("AWS region without one = %q, want us-east-1", got)
	}
}

func TestS3Endpoint(t *testing.T) {
	if got := S3Endpoint(garagePI()); got != "http://garage:3900" {
		t.Fatalf("Garage endpoint = %q", got)
	}
	if got := S3Endpoint(osi_types.PlatformInfo{S3BucketType: S3BucketTypeAWS}); got != "" {
		t.Fatalf("AWS endpoint = %q, want empty", got)
	}
}

var (
	keyIDRe  = regexp.MustCompile(`^GK[0-9a-f]{24}$`)
	secretRe = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

func TestEnsureGarageSecretsGeneratesDistinctKeys(t *testing.T) {
	pi := garagePI()
	if !EnsureGarageSecrets(&pi, false) {
		t.Fatal("first call reported no change")
	}
	if !secretRe.MatchString(pi.GarageRPCSecret) {
		t.Fatalf("rpc_secret %q is not 32 bytes of hex", pi.GarageRPCSecret)
	}
	seen := map[string]bool{}
	for _, c := range S3Consumers {
		k := S3CredentialsFor(pi, c)
		if !keyIDRe.MatchString(k.AccessKeyID) || !secretRe.MatchString(k.SecretAccessKey) {
			t.Fatalf("%s: bad key %q / %q", c, k.AccessKeyID, k.SecretAccessKey)
		}
		if seen[k.AccessKeyID] {
			t.Fatalf("%s: access key reused", c)
		}
		seen[k.AccessKeyID] = true
	}
	if len(seen) != 6 {
		t.Fatalf("got %d keys, want 6", len(seen))
	}
}

func TestEnsureGarageSecretsIsIdempotentAndForceRotates(t *testing.T) {
	pi := garagePI()
	EnsureGarageSecrets(&pi, false)
	before := pi
	if EnsureGarageSecrets(&pi, false) {
		t.Fatal("second call changed something")
	}
	if pi.GarageRPCSecret != before.GarageRPCSecret || pi.S3KeyCLI != before.S3KeyCLI ||
		pi.S3KeyWalgAdmin != before.S3KeyWalgAdmin {
		t.Fatal("second call modified the secrets")
	}

	// A state file from before one consumer existed: only that one is filled.
	pi.S3KeyCLI = osi_types.S3Credentials{}
	if !EnsureGarageSecrets(&pi, false) {
		t.Fatal("missing key not reported")
	}
	if pi.S3KeyPipelines != before.S3KeyPipelines || pi.S3KeyCLI.AccessKeyID == "" {
		t.Fatal("filling one key touched the others or left it empty")
	}

	EnsureGarageSecrets(&pi, true)
	if pi.S3KeyPipelines == before.S3KeyPipelines || pi.GarageRPCSecret == before.GarageRPCSecret {
		t.Fatal("force did not rotate")
	}
}

func TestEnsureGarageSecretsNoopForAWS(t *testing.T) {
	pi := osi_types.PlatformInfo{S3BucketType: S3BucketTypeAWS,
		AWSAccessKeyIDS3Bucket: "AKIA", AWSSecretAccessKeyS3Bucket: "s"}
	if EnsureGarageSecrets(&pi, true) || pi.S3KeyCLI.AccessKeyID != "" {
		t.Fatal("generated Garage keys for an AWS platform")
	}
	if k := S3CredentialsFor(pi, S3ConsumerPipelines); k.AccessKeyID != "AKIA" {
		t.Fatalf("AWS consumer got %q, want the bucket's credentials", k.AccessKeyID)
	}
}

func TestCheckS3BucketType(t *testing.T) {
	for _, bad := range []string{"", "Local Minio"} {
		if err := CheckS3BucketType(osi_types.PlatformInfo{S3BucketType: bad}); err == nil {
			t.Fatalf("%q accepted", bad)
		}
	}
	for _, ok := range []string{S3BucketTypeGarage, S3BucketTypeAWS} {
		if err := CheckS3BucketType(osi_types.PlatformInfo{S3BucketType: ok}); err != nil {
			t.Fatalf("%s refused: %v", ok, err)
		}
	}
}

// TestGarageProvisionSpec checks the format garage-provision parses, and
// writes the spec to $GARAGE_SPEC_OUT when set, so the script can be
// run against it (see the garage image's test).
func TestGarageProvisionSpec(t *testing.T) {
	pi := garagePI()
	EnsureGarageSecrets(&pi, false)
	spec := GarageProvisionSpec(pi)
	lines := strings.Split(strings.TrimSpace(spec), "\n")
	if lines[0] != "bucket osi4iot" {
		t.Fatalf("first line %q", lines[0])
	}
	keys := 0
	for _, l := range lines {
		f := strings.Fields(l)
		if f[0] == "key" {
			keys++
			if len(f) != 5 || f[4] != "rw" {
				t.Fatalf("bad key line %q", l)
			}
		}
	}
	if keys != len(S3Consumers) {
		t.Fatalf("%d key lines, want %d", keys, len(S3Consumers))
	}
	if out := os.Getenv("GARAGE_SPEC_OUT"); out != "" {
		if err := os.WriteFile(out, []byte(spec), 0600); err != nil {
			t.Fatal(err)
		}
	}
}
