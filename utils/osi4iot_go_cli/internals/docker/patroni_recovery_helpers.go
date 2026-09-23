package docker

import (
	"bytes"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/pkg/stdcopy"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// Helpers shared by patroni_extract.go and patroni_apply.go.

// walgEnvFor returns the environment a standalone container needs to
// run wal-g against one cluster's archive.
//
// These are the same variables secrets.CreatePatroniSecrets writes into
// the patroni_<family> secret. They are rebuilt from PlatformData
// rather than read from the secret because Docker does not allow
// reading a secret's contents back, and a standalone container cannot
// mount one at all.
func walgEnvFor(pd *pt.PlatformData, family patroniFamily) []string {
	pi := pd.PlatformInfo

	awsAccessKeyID := pi.PlatformAdminUserName
	awsSecretAccessKey := pi.PlatformAdminPassword
	awsRegion := "us-east-1"
	if pi.S3BucketType == "Cloud AWS S3" {
		awsAccessKeyID = pi.AWSAccessKeyIDS3Bucket
		awsSecretAccessKey = pi.AWSSecretAccessKeyS3Bucket
		awsRegion = utils.AwsRegionCode(pi.AWSRegionS3Bucket)
	}

	prefix := pi.WalgS3PrefixAdmin
	if family.NamePrefix == "patroni_metrics" {
		prefix = pi.WalgS3PrefixMetrics
	}

	env := []string{
		"WALG_S3_PREFIX=" + prefix,
		"WALG_LIBSODIUM_KEY=" + pi.WalgLibsodiumKey,
		"WALG_LIBSODIUM_KEY_TRANSFORM=hex",
		"WALG_COMPRESSION_METHOD=" + pi.WalgCompressionMethod,
		"AWS_ACCESS_KEY_ID=" + awsAccessKeyID,
		"AWS_SECRET_ACCESS_KEY=" + awsSecretAccessKey,
		"AWS_REGION=" + awsRegion,
		"PGDATA=" + extractDataDir,
	}
	if pi.MinioEndpoint != "" && pi.S3BucketType != "Cloud AWS S3" {
		env = append(env,
			"AWS_ENDPOINT="+pi.MinioEndpoint,
			"AWS_S3_FORCE_PATH_STYLE=true",
		)
	}
	return env
}

// pgBinPath prepends PostgreSQL's versioned binary directory to PATH.
//
// The patroni image does not put the server binaries on PATH —
// patroni.yml points Patroni at /usr/lib/postgresql/<major>/bin
// instead. Debian's postgresql-common wraps the client tools (psql,
// pg_dump) in /usr/bin, but not pg_ctl or pg_controldata, so anything
// that needs those fails with a bare:
//
//	sh: 1: pg_ctl: not found
//
// The major version is globbed rather than hardcoded so an upgrade of
// the image does not silently break this.
//
// Only usable where the command runs in the SAME shell: exporting PATH
// and then calling `su` does not work, because su resets PATH for the
// target user. The extract instance's start-up script interpolates an
// absolute path instead — see startExtractInstance.
const pgBinPath = `export PATH="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -1):$PATH"; `

// patroniSuperuser returns the role and password to connect to one
// cluster with.
//
// The role is named after the cluster — patroni_admin /
// patroni_metrics — and is hardcoded in patroni.yml's
// postgresql.authentication.superuser. There is deliberately NO
// "postgres" role, which is what made an earlier attempt to connect as
// the postgres OS user fail with `role "postgres" does not exist`.
func patroniSuperuser(pd *pt.PlatformData, family patroniFamily) (string, string) {
	if family.NamePrefix == "patroni_metrics" {
		return "patroni_metrics", pd.PlatformInfo.TimescalePassword
	}
	return "patroni_admin", pd.PlatformInfo.PostgresPassword
}

// psqlCommand builds a psql invocation for one cluster over TCP on
// localhost.
//
// TCP rather than the unix socket, because patroni.yml's bootstrap
// pg_hba has only `host` rules — no `local` line at all — so socket
// connections are rejected outright whatever the credentials. The
// sidecar connects the same way, over PGHOST=localhost.
//
// Inside a container, localhost is still only reachable from that
// container, so this exposes nothing.
func psqlCommand(pd *pt.PlatformData, family patroniFamily, args string) string {
	user, password := patroniSuperuser(pd, family)
	database := patroniDatabaseName(pd, family)

	return pgBinPath + fmt.Sprintf("PGPASSWORD=%s psql -h localhost -p 5432 -U %s -d %s %s",
		shellQuote(password), shellQuote(user), shellQuote(database), args)
}

// patroniDatabaseName returns the database the platform's data lives
// in for one cluster.
func patroniDatabaseName(pd *pt.PlatformData, family patroniFamily) string {
	if family.NamePrefix == "patroni_metrics" {
		return pd.PlatformInfo.TimescaleDB
	}
	return pd.PlatformInfo.PostgresDB
}

// pickBackupBefore chooses the newest base backup taken at or before
// targetTime.
//
// Recovering to a moment needs a base backup from BEFORE it: WAL only
// replays forward. Picking the newest such backup also keeps the replay
// short, which matters because that replay is most of the wait.
func pickBackupBefore(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, targetTime string) (string, error) {
	target, err := parseRecoveryTime(targetTime)
	if err != nil {
		return "", err
	}

	backups, err := listPatroniFamilyBackups(pd, dc, family)
	if err != nil {
		return "", err
	}
	if len(backups) == 0 {
		return "", fmt.Errorf("no backups in the wal-g catalogue for %s", family.NamePrefix)
	}

	type candidate struct {
		name string
		when time.Time
	}
	var usable []candidate
	for _, b := range backups {
		when, err := parseRecoveryTime(b.Time)
		if err != nil {
			continue // an unparseable timestamp is not a reason to fail the whole lookup
		}
		if !when.After(target) {
			usable = append(usable, candidate{name: b.Name, when: when})
		}
	}
	if len(usable) == 0 {
		return "", fmt.Errorf("every backup for %s was taken after %s, so there is nothing to "+
			"recover that moment from.\nThe oldest backup is from %s",
			family.NamePrefix, targetTime, backups[len(backups)-1].Time)
	}

	sort.Slice(usable, func(i, j int) bool { return usable[i].when.After(usable[j].when) })
	return usable[0].name, nil
}

// parseRecoveryTime accepts the shapes an operator is likely to type
// and the ones wal-g reports.
func parseRecoveryTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05-0700",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, value); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("could not read %q as a time. Use something like "+
		"'2026-09-11 09:00:00+02'", value)
}

// execInContainer runs a command inside a container as user and returns
// its combined output and exit code.
//
// The user is set through Docker's own exec option rather than by
// wrapping the command in `su`. That was the first attempt and it does
// not work: the patroni image declares USER postgres, so the exec
// already runs as a non-root user, and `su` invoked by anyone but root
// asks for a password — which in a container nobody can answer:
//
//	psql exited 1: Password: su: Authentication failure
//
// Setting User here works whatever the image's default user happens to
// be, and needs no password for any of them.
func execInContainer(dc *pt.DockerClient, containerID, user string, cmd []string, stdin []byte) (string, int, error) {
	execCfg := container.ExecOptions{
		User:         user,
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		AttachStdin:  stdin != nil,
	}
	created, err := dc.Cli.ContainerExecCreate(dc.Ctx, containerID, execCfg)
	if err != nil {
		return "", 0, fmt.Errorf("error creating exec: %w", err)
	}

	attached, err := dc.Cli.ContainerExecAttach(dc.Ctx, created.ID, container.ExecAttachOptions{})
	if err != nil {
		return "", 0, fmt.Errorf("error attaching to exec: %w", err)
	}
	defer attached.Close()

	if stdin != nil {
		if _, err := attached.Conn.Write(stdin); err != nil {
			return "", 0, fmt.Errorf("error writing to exec stdin: %w", err)
		}
		attached.CloseWrite()
	}

	// Docker multiplexes stdout and stderr on one stream unless the
	// container has a TTY; stdcopy splits them back out. Without this
	// the output comes back with 8-byte frame headers embedded in it.
	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, attached.Reader); err != nil {
		return "", 0, fmt.Errorf("error reading exec output: %w", err)
	}

	inspect, err := dc.Cli.ContainerExecInspect(dc.Ctx, created.ID)
	if err != nil {
		return "", 0, fmt.Errorf("error inspecting exec: %w", err)
	}

	out := stdout.String()
	if stderr.Len() > 0 {
		out += "\n" + stderr.String()
	}
	return out, inspect.ExitCode, nil
}

// shellQuote wraps a value in single quotes for safe use inside the
// `sh -c` strings this package builds.
func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}