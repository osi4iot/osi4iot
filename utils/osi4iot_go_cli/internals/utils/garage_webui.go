package utils

import (
	"fmt"
	"strings"

	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"golang.org/x/crypto/bcrypt"
)

// Garage Web UI (github.com/khairul169/garage-webui, built from source
// as ghcr.io/osi4iot/garage_webui — see images/garage_webui): an admin interface
// for the platform's Garage — cluster and layout, buckets, keys and an
// object browser. Deployed with every "Local Garage" platform, on a
// manager node, behind Traefik at https://<domain>/garage_webui.
//
// # What it is given, and what it is not
//
// Everything reaches it through one Swarm secret, mounted as .env in the
// image's working directory and read by the application itself
// (godotenv): the admin API and S3
// endpoints, the platform's S3 region, Garage's admin token and the
// login. NOT garage.toml, although the application can read it: its
// /api/config route returns the whole file to the browser, rpc_secret
// and admin_token included, and the only part of it the interface uses
// is [s3_web], which this platform does not configure.
//
// # Login
//
// The platform administrator's user name and password. The application
// wants "user:bcrypt-hash"; the hash is kept in the state file
// (GarageWebUIAuthHash) and only regenerated when the password no longer
// matches it — a fresh salt on every deploy would change the secret, and
// restart the service, each time.

const (
	GarageWebUIServiceName  = "garage_webui"
	DefaultGarageWebUIImage = "ghcr.io/osi4iot/garage_webui:1.1.0"
	GarageWebUIPort         = 3909
	// GarageWebUIEnvPath is where the application reads its .env: the
	// image's working directory is /app.
	GarageWebUIEnvPath = "/app/.env"
	// GarageWebUIUID is the unprivileged user the image runs as; the
	// secret is mounted readable by it alone.
	GarageWebUIUID = "10001"
	// GarageWebUIBasePath is both the Traefik path prefix and the
	// application's BASE_PATH: it serves its pages and API under it
	// itself, so Traefik must NOT strip it.
	GarageWebUIBasePath = "/garage_webui"
	// GarageAdminEndpoint is Garage's admin API on internal_net.
	GarageAdminEndpoint = "http://garage:3903"
)

// checkGarageWebUIUser rejects user names the application cannot take:
// it splits AUTH_USER_PASS on ':', and the value goes in single quotes.
func checkGarageWebUIUser(user string) error {
	if user == "" {
		return fmt.Errorf("the platform has no administrator user name")
	}
	if strings.ContainsAny(user, ":'\n\r") {
		return fmt.Errorf("the platform administrator's user name %q contains ':', a quote "+
			"or a line break, which Garage Web UI's login cannot handle", user)
	}
	return nil
}

// EnsureGarageWebUIAuth makes GarageWebUIAuthHash a bcrypt hash of the
// platform administrator's current password. Returns whether it changed,
// so the caller saves the state file. Does nothing for an AWS platform.
func EnsureGarageWebUIAuth(pi *osi_types.PlatformInfo) (bool, error) {
	if !IsGarage(*pi) {
		return false, nil
	}
	if err := checkGarageWebUIUser(pi.PlatformAdminUserName); err != nil {
		return false, err
	}
	if pi.PlatformAdminPassword == "" {
		return false, fmt.Errorf("the platform has no administrator password")
	}
	if pi.GarageWebUIAuthHash != "" &&
		bcrypt.CompareHashAndPassword([]byte(pi.GarageWebUIAuthHash), []byte(pi.PlatformAdminPassword)) == nil {
		return false, nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pi.PlatformAdminPassword), bcrypt.DefaultCost)
	if err != nil {
		// bcrypt only takes up to 72 bytes.
		return false, fmt.Errorf("error hashing the administrator password for Garage Web UI: %w", err)
	}
	pi.GarageWebUIAuthHash = string(hash)
	return true, nil
}

// GarageWebUIEnvFile renders the .env Garage Web UI reads at start-up.
//
// Every value is single-quoted: godotenv expands $VARIABLES in unquoted
// and double-quoted values, and a bcrypt hash is full of '$' — it would
// arrive mangled and no login would ever succeed.
func GarageWebUIEnvFile(pi osi_types.PlatformInfo) string {
	quote := func(key, value string) string {
		return fmt.Sprintf("%s='%s'", key, value)
	}
	lines := []string{
		quote("API_BASE_URL", GarageAdminEndpoint),
		quote("API_ADMIN_KEY", pi.GarageAdminToken),
		quote("S3_ENDPOINT_URL", GarageS3Endpoint),
		quote("S3_REGION", GarageS3Region),
		quote("AUTH_USER_PASS", pi.PlatformAdminUserName+":"+pi.GarageWebUIAuthHash),
	}
	return strings.Join(lines, "\n") + "\n"
}
