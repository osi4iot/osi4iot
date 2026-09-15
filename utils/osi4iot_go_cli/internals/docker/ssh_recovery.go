package docker

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/docker/docker/client"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// A RecoveryTarget is a host the CLI can both drive Docker on and open
// TCP connections to — either this machine or a node reached over SSH.
//
// It exists for `osi4iot state restore --from-minio`, which needs two
// things from the same host at once: the Docker API, to start a
// temporary MinIO against the minio_storage volume, and a way to reach
// the port that MinIO listens on. The rest of the CLI only ever needs
// the first, which is why this doesn't reuse getNodeDockerClient.
//
// # Why not the existing SSH path
//
// getConnectionHelper shells out to the `ssh` binary running
// `docker system dial-stdio`, which gives a Docker connection and
// nothing else — no way to reach a port on the far side. Since a port
// dialer is needed anyway, doing both over one golang.org/x/crypto/ssh
// connection is less machinery rather than more, and it picks up three
// things on the way: password authentication works (the `ssh -i` path
// only ever did keys), the `ssh` binary stops being a requirement, and
// the private key no longer has to be written to a temp file in the
// clear. For the command that has to work when everything else is
// broken, those matter.
//
// # Host keys
//
// Host key verification is off, matching what getConnectionHelper
// already does with StrictHostKeyChecking=no. It is worth being clear
// that this is a real gap rather than a formality: what travels over
// this connection is every credential the platform has.
type RecoveryTarget struct {
	// Name describes the host for messages: "this host" or an address.
	Name string
	// Cli drives Docker on the target.
	Cli *client.Client
	// Dial opens a TCP connection from the target's point of view, so
	// "127.0.0.1:9000" means the target's loopback, not the CLI's. That
	// is what lets the temporary MinIO stay bound to loopback and still
	// be reachable from here.
	Dial func(ctx context.Context, network, addr string) (net.Conn, error)

	sshClient *ssh.Client
}

// Close releases the Docker client and, if there is one, the SSH
// connection.
func (t *RecoveryTarget) Close() {
	if t == nil {
		return
	}
	if t.Cli != nil {
		t.Cli.Close()
		t.Cli = nil
	}
	if t.sshClient != nil {
		t.sshClient.Close()
		t.sshClient = nil
	}
}

// SSHTarget describes how to reach a node. Leave both KeyPEM and
// Password empty to try the SSH agent and the usual key locations.
type SSHTarget struct {
	Host string
	User string
	// KeyPEM is a private key's contents (what utils.GetSshPrivKey
	// returns from the state file). Takes precedence over KeyPath.
	KeyPEM string
	// KeyPath is a private key file to read.
	KeyPath string
	// Password authenticates with a password instead of a key.
	Password string
}

// ErrSSHAuth means the target was reachable but refused every
// credential tried. Callers use it to decide whether asking the
// operator for a key or password is worth doing — as opposed to a
// network error, where asking would just waste their time.
var ErrSSHAuth = errors.New("ssh authentication failed")

// OpenLocalRecoveryTarget returns a target backed by the local Docker
// socket. Used first, before anything is asked of the operator: running
// the recovery on the node that holds the volume is the simplest case,
// and it needs no credentials at all.
func OpenLocalRecoveryTarget() (*RecoveryTarget, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("error connecting to the local Docker daemon: %w", err)
	}

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	return &RecoveryTarget{
		Name: "this host",
		Cli:  cli,
		Dial: dialer.DialContext,
	}, nil
}

// OpenSSHRecoveryTarget connects to a node over SSH and builds a Docker
// client that speaks to its /var/run/docker.sock through that same
// connection.
func OpenSSHRecoveryTarget(target SSHTarget) (*RecoveryTarget, error) {
	if target.Host == "" || target.User == "" {
		return nil, fmt.Errorf("both a host and an SSH user are required")
	}

	auths, err := sshAuthMethods(target)
	if err != nil {
		return nil, err
	}
	if len(auths) == 0 {
		return nil, fmt.Errorf("%w: no SSH agent, key or password available for %s@%s",
			ErrSSHAuth, target.User, target.Host)
	}

	sshClient, err := ssh.Dial("tcp", withDefaultPort(target.Host), &ssh.ClientConfig{
		User: target.User,
		Auth: auths,
		// Matches getConnectionHelper's StrictHostKeyChecking=no. See
		// the note on RecoveryTarget.
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         20 * time.Second,
	})
	if err != nil {
		if isSSHAuthError(err) {
			return nil, fmt.Errorf("%w for %s@%s: %v", ErrSSHAuth, target.User, target.Host, err)
		}
		return nil, fmt.Errorf("error connecting to %s@%s: %w", target.User, target.Host, err)
	}

	// The Docker socket is reached through the same SSH connection with
	// OpenSSH's direct-streamlocal extension, so no port is opened and
	// no `ssh` binary is involved.
	dialSocket := func(ctx context.Context, network, addr string) (net.Conn, error) {
		return sshClient.Dial("unix", "/var/run/docker.sock")
	}

	cli, err := client.NewClientWithOpts(
		client.WithHost("http://docker.example.com"),
		client.WithHTTPClient(&http.Client{Transport: &http.Transport{DialContext: dialSocket}}),
		client.WithDialContext(dialSocket),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		sshClient.Close()
		return nil, fmt.Errorf("error creating a Docker client for %s: %w", target.Host, err)
	}

	t := &RecoveryTarget{
		Name:      target.Host,
		Cli:       cli,
		sshClient: sshClient,
		Dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return sshClient.Dial(network, addr)
		},
	}

	// Fail here rather than at the first real call: "cannot reach
	// Docker on that node" is a much clearer thing to be told while
	// still choosing a node than midway through starting MinIO.
	pingCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if _, err := cli.Ping(pingCtx); err != nil {
		t.Close()
		return nil, fmt.Errorf("connected to %s over SSH, but its Docker daemon did not answer "+
			"(is '%s' allowed to use the Docker socket?): %w", target.Host, target.User, err)
	}
	return t, nil
}

// sshAuthMethods builds the authentication chain, most convenient
// first: an explicit password or key when the caller has one, then the
// SSH agent, then the key files this CLI and ssh itself normally use.
//
// The agent and the default paths come before any prompt on purpose.
// An operator who can already `ssh` into their nodes has one or the
// other working, and the platform's own key stays at a fixed path
// relative to the working directory — losing osi4iot_state.json does
// not remove .osi4iot_keys/ next to it. So the common case asks
// nothing.
func sshAuthMethods(target SSHTarget) ([]ssh.AuthMethod, error) {
	if target.Password != "" {
		return []ssh.AuthMethod{ssh.Password(target.Password)}, nil
	}

	var methods []ssh.AuthMethod

	if target.KeyPEM != "" {
		signer, err := ssh.ParsePrivateKey([]byte(target.KeyPEM))
		if err != nil {
			return nil, fmt.Errorf("the SSH private key could not be parsed: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if target.KeyPath != "" {
		signer, err := signerFromFile(target.KeyPath)
		if err != nil {
			return nil, err
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if len(methods) > 0 {
		return methods, nil
	}

	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if conn, err := net.Dial("unix", sock); err == nil {
			methods = append(methods, ssh.PublicKeysCallback(agent.NewClient(conn).Signers))
		}
	}

	for _, path := range defaultKeyPaths() {
		if signer, err := signerFromFile(path); err == nil {
			methods = append(methods, ssh.PublicKeys(signer))
		}
	}
	return methods, nil
}

// defaultKeyPaths lists where a usable key is likely to be: the two
// locations this CLI writes to (see utils.GetSshPrivKeyLocalPath),
// relative to the working directory, then the standard user keys.
func defaultKeyPaths() []string {
	paths := []string{
		"./.osi4iot_keys/osi4iot_key",
		"./.osi4iot_keys/aws_ssh_key.pem",
	}
	if home, err := os.UserHomeDir(); err == nil {
		paths = append(paths,
			filepath.Join(home, ".ssh", "id_ed25519"),
			filepath.Join(home, ".ssh", "id_rsa"),
		)
	}
	return paths
}

func signerFromFile(path string) (ssh.Signer, error) {
	key, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("error reading the SSH key %s: %w", path, err)
	}
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("the SSH key %s could not be parsed "+
			"(passphrase-protected keys are not supported here; use the SSH agent): %w", path, err)
	}
	return signer, nil
}

// SSHTargetsFromPlatformData turns whatever node data the state file
// holds into targets, managers first.
//
// It returns nothing when there is no state file, which is the case
// this whole recovery path exists for — the caller then falls back to
// the local host and, failing that, to asking. When the state file IS
// readable (stale or superseded rather than gone), this makes the whole
// thing automatic: the nodes, the SSH user and the key are all in it.
func SSHTargetsFromPlatformData(pd *pt.PlatformData) []SSHTarget {
	nodes := pd.PlatformInfo.NodesData
	if len(nodes) == 0 {
		return nil
	}

	keyPEM, err := utils.GetSshPrivKey(pd)
	if err != nil {
		keyPEM = "" // fall through to the agent and default paths
	}

	var managers, others []SSHTarget
	for _, node := range nodes {
		if node.NodeIP == "" || node.NodeUserName == "" {
			continue
		}
		t := SSHTarget{
			Host:     node.NodeIP,
			User:     node.NodeUserName,
			KeyPEM:   keyPEM,
			Password: node.NodePassword,
		}
		// The volume is on whichever node last ran MinIO, which is
		// placement-constrained to managers.
		if node.NodeRole == "Manager" {
			managers = append(managers, t)
		} else {
			others = append(others, t)
		}
	}
	return append(managers, others...)
}

func withDefaultPort(host string) string {
	if _, _, err := net.SplitHostPort(host); err == nil {
		return host
	}
	return net.JoinHostPort(host, "22")
}

func isSSHAuthError(err error) bool {
	if err == nil {
		return false
	}
	var partial *ssh.PartialSuccessError
	if errors.As(err, &partial) {
		return true
	}
	// x/crypto/ssh reports a failed handshake as a plain error, so
	// matching on its message is the only option available.
	msg := err.Error()
	for _, sub := range []string{"unable to authenticate", "no supported methods remain", "handshake failed"} {
		if strings.Contains(msg, sub) {
			return true
		}
	}
	return false
}
