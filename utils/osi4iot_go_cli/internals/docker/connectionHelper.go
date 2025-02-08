package docker

import (
	"context"
	"net"
	"net/url"
	"strings"

	"github.com/docker/cli/cli/connhelper"
	"github.com/docker/cli/cli/connhelper/commandconn"
	"github.com/docker/cli/cli/connhelper/ssh"
	"github.com/pkg/errors"
)


func getConnectionHelper(daemonURL, privateKeyPath string) (*connhelper.ConnectionHelper, error) {
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

	sshFlags := []string{"-i", privateKeyPath}

	sshFlags = addSSHTimeout(sshFlags)
	sshFlags = disablePseudoTerminalAllocation(sshFlags)
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
		sshFlags = append(sshFlags, "-o ConnectTimeout=30")
	}
	return sshFlags
}

// disablePseudoTerminalAllocation disables pseudo-terminal allocation to
// prevent SSH from executing as a login shell
func disablePseudoTerminalAllocation(sshFlags []string) []string {
	for _, flag := range sshFlags {
		if flag == "-T" {
			return sshFlags
		}
	}
	return append(sshFlags, "-T")
}
