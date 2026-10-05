package utils

import (
	"os"
	"strings"
	"testing"

	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"golang.org/x/crypto/bcrypt"
)

func webuiPI() osi_types.PlatformInfo {
	pi := garagePI()
	pi.PlatformAdminUserName = "admin"
	pi.PlatformAdminPassword = "s3cr3t-Pa$$"
	EnsureGarageSecrets(&pi, false)
	return pi
}

func TestEnsureGarageWebUIAuth(t *testing.T) {
	pi := webuiPI()
	changed, err := EnsureGarageWebUIAuth(&pi)
	if err != nil || !changed {
		t.Fatalf("first call: changed=%v err=%v", changed, err)
	}
	if bcrypt.CompareHashAndPassword([]byte(pi.GarageWebUIAuthHash), []byte("s3cr3t-Pa$$")) != nil {
		t.Fatal("hash does not match the password")
	}

	// Same password: same hash, so the secret (and the service) do not change.
	before := pi.GarageWebUIAuthHash
	if changed, _ := EnsureGarageWebUIAuth(&pi); changed || pi.GarageWebUIAuthHash != before {
		t.Fatal("hash regenerated without a password change")
	}

	// --reset-passwords: the login follows the new password.
	pi.PlatformAdminPassword = "otra-clave"
	if changed, _ := EnsureGarageWebUIAuth(&pi); !changed {
		t.Fatal("password change not detected")
	}
	if bcrypt.CompareHashAndPassword([]byte(pi.GarageWebUIAuthHash), []byte("otra-clave")) != nil {
		t.Fatal("new hash does not match the new password")
	}
}

func TestEnsureGarageWebUIAuthRejectsBadUser(t *testing.T) {
	for _, user := range []string{"", "a:b", "o'neil", "x\ny"} {
		pi := webuiPI()
		pi.PlatformAdminUserName = user
		if _, err := EnsureGarageWebUIAuth(&pi); err == nil {
			t.Errorf("user %q accepted", user)
		}
	}
	aws := osi_types.PlatformInfo{S3BucketType: S3BucketTypeAWS}
	if changed, err := EnsureGarageWebUIAuth(&aws); changed || err != nil {
		t.Fatal("AWS platform got a Web UI login")
	}
}

// TestGarageWebUIEnvFile writes the file to $GARAGE_WEBUI_ENV_OUT when
// set, so it can be loaded with the real godotenv outside this module.
func TestGarageWebUIEnvFile(t *testing.T) {
	pi := webuiPI()
	EnsureGarageWebUIAuth(&pi)
	env := GarageWebUIEnvFile(pi)
	for _, want := range []string{
		"API_BASE_URL='http://garage:3903'",
		"S3_ENDPOINT_URL='http://garage:3900'",
		"S3_REGION='us-east-1'",
		"API_ADMIN_KEY='" + pi.GarageAdminToken + "'",
		"AUTH_USER_PASS='admin:" + pi.GarageWebUIAuthHash + "'",
	} {
		if !strings.Contains(env, want) {
			t.Errorf("missing %s", want)
		}
	}
	if strings.Contains(env, pi.GarageRPCSecret) {
		t.Fatal("the RPC secret must not reach the Web UI")
	}
	if out := os.Getenv("GARAGE_WEBUI_ENV_OUT"); out != "" {
		os.WriteFile(out, []byte(env), 0600)
	}
}
