package docker

import (
	"context"
	"net"
	"net/url"
	"os"
	"strings"

	"github.com/docker/cli/cli/connhelper"
	"github.com/docker/cli/cli/connhelper/commandconn"
	"github.com/docker/cli/cli/connhelper/ssh"
	"github.com/pkg/errors"
)

func getConnectionHelper(daemonURL string, sshPrivKeyTempFile *os.File) (*connhelper.ConnectionHelper, error) {
	u, err := url.Parse(daemonURL)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "ssh" {
		return nil, errors.New("unsupported scheme, only ssh is supported")
	}

	sp, err := ssh.ParseURL(daemonURL)
	if err != nil {
		return nil, errors.Wrap(err, "ssh host connection is not valid")
	}

	sshFlags := []string{"-i", sshPrivKeyTempFile.Name()}

	sshFlags = addSSHTimeout(sshFlags)
	sshFlags = disablePseudoTerminalAllocation(sshFlags)
	sshFlags = append(sshFlags, "-o", "StrictHostKeyChecking=no")
	sshFlags = append(sshFlags, "-o", "UserKnownHostsFile=/dev/null")
	// Only the platform's key: not those of an ssh-agent too, which the
	// server counts against its MaxAuthTries before this one is tried.
	sshFlags = append(sshFlags, "-o", "IdentitiesOnly=yes")
	// Never a prompt (a password, a passphrase): fail at once instead.
	sshFlags = append(sshFlags, "-o", "BatchMode=yes")
	// Errors only: the notice of a host added to known hosts was all that an
	// error showed of ssh's output, the real cause (Permission denied, the
	// remote docker failing…) left out.
	sshFlags = append(sshFlags, "-o", "LogLevel=ERROR")
	helper := &connhelper.ConnectionHelper{
		Dialer: func(ctx context.Context, network, addr string) (net.Conn, error) {
			args := []string{"docker"}
			if sp.Path != "" {
				args = append(args, "--host", "unix://"+sp.Path)
			}
			args = append(args, "system", "dial-stdio")
			fullArgs := append(sshFlags, sp.Args(args...)...)
			return commandconn.New(ctx, "ssh", fullArgs...)
		},
		Host: "http://docker.example.com",
	}
	return helper, nil
}

func addSSHTimeout(sshFlags []string) []string {
	if !strings.Contains(strings.Join(sshFlags, ""), "ConnectTimeout") {
		sshFlags = append(sshFlags, "-o", "ConnectTimeout=30")
	}
	return sshFlags
}

// DisablePseudoTerminalAllocation disables pseudo-terminal allocation to
// prevent SSH from executing as a login shell
func disablePseudoTerminalAllocation(sshFlags []string) []string {
	for _, flag := range sshFlags {
		if flag == "-T" {
			return sshFlags
		}
	}
	return append(sshFlags, "-T")
}
