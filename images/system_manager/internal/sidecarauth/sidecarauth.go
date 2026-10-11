// Package sidecarauth is the one place system_manager attaches
// patroni_sidecar's optional shared secret to its requests.
//
// patroni_sidecar checks an "Authorization: Bearer <token>" header on its
// endpoints when PATRONI_SIDECAR_API_TOKEN is set in its environment, and
// lets every request through when it is not. system_manager reads the
// same variable, so both sides agree as long as the deployment gives them
// the same value.
//
// Every request to the sidecar must go through Set. That used to be a
// helper private to patroni_backup, so the backup calls sent the token
// while the Patroni cluster calls (/leader, /switchover, /reset_raft) in
// package patroni did not — harmless while no token is configured, but
// turning one on would have made every scale-down fail with 401.
package sidecarauth

import (
	"fmt"
	"net/http"
	"os"
)

// EnvVar is the variable both patroni_sidecar and system_manager read
// the shared secret from.
const EnvVar = "PATRONI_SIDECAR_API_TOKEN"

// Set attaches the shared secret to req when one is configured. A no-op
// when EnvVar is unset, which is how deployments run until the platform
// CLI distributes a token.
func Set(req *http.Request) {
	if token := os.Getenv(EnvVar); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
}

// UnauthorizedError explains a 401 from the sidecar in terms of what to
// fix, instead of a bare "401 Unauthorized".
func UnauthorizedError(url string) error {
	if os.Getenv(EnvVar) == "" {
		return fmt.Errorf("%s returned 401: patroni_sidecar requires a token but %s is not set "+
			"in system_manager's environment", url, EnvVar)
	}
	return fmt.Errorf("%s returned 401: %s in system_manager does not match patroni_sidecar's", url, EnvVar)
}

