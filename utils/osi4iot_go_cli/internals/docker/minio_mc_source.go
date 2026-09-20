package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/pkg/stdcopy"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// mcSource reads the platform's MinIO through `mc`, running in a
// throwaway container on the platform's own overlay network.
//
// # Why this shape
//
// MinIO is only reachable from inside internal_net: it publishes no
// host port outside development mode, and Traefik's /minio_api route
// cannot carry S3 traffic because SigV4 signs the request path. So
// something has to run inside the network, and the question is only
// what.
//
// The platform's own MinIO image turns out to carry `mc` at
// /opt/bin/mc, which means the answer needs no new image on the nodes,
// no published port, and no TCP forwarding: the objects come out
// through the Docker exec API, which is the same channel the CLI
// already uses for everything else and which works unchanged over SSH.
//
// # What it costs
//
// One exec per object. For a WAL directory of thousands of small
// segments that is thousands of round trips, which is slower than a
// pool of HTTP connections would be — but each one streams, nothing is
// staged on the node's disk, and the bottleneck on a real snapshot is
// the base backup rather than the segment count.

const (
	// mcContainerName is fixed rather than random so an interrupted run
	// leaves something findable that the next attempt can clear,
	// instead of failing on a name clash.
	mcContainerName = "osi4iot-snapshot-mc"

	// mcNetwork is the overlay the minio service is reachable by name
	// on. networks.GenerateNetworks makes it Attachable, which is what
	// lets a standalone container join it.
	mcNetwork = "internal_net"

	// mcAlias is the alias the credentials are bound to, via the
	// MC_HOST_<alias> environment variable.
	mcAlias = "plat"

	// mcBinary is where the platform's MinIO image keeps mc.
	mcBinary = "mc"

	// mcIdleLifetime bounds how long the helper can outlive the CLI if
	// something goes very wrong — a crash that skips both the deferred
	// Close and CleanResources. A snapshot that has not finished in
	// this long has a different problem.
	mcIdleLifetime = 24 * time.Hour
)

type mcSource struct {
	dc          *pt.DockerClient
	containerID string
}

// startMcSource brings up the helper container and proves it can see
// the bucket before returning.
func startMcSource(
	ctx context.Context,
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	image, user, password string,
	logger *log.Logger,
) (*mcSource, error) {
	if dc == nil || dc.Cli == nil {
		return nil, fmt.Errorf("no docker client to reach MinIO with")
	}
	if image == "" {
		image = utils.GetServiceImage(pd, "minio", DefaultMinioImage)
	}

	removeStaleMcContainer(ctx, dc)

	if logger != nil {
		logger.Printf("Starting a MinIO client on the platform network...")
	}

	// MC_HOST_<alias> carries the endpoint and the credentials in one
	// variable, which avoids an `mc alias set` exec and avoids writing
	// a config file with the platform admin password into the
	// container's filesystem. url.UserPassword escapes a password
	// containing ':' or '@', which the generated ones can.
	endpoint := url.URL{
		Scheme: "http",
		User:   url.UserPassword(user, password),
		Host:   "minio:9000",
	}

	created, err := dc.Cli.ContainerCreate(ctx,
		&container.Config{
			Image: image,
			// The image's entrypoint starts a MinIO server; this
			// container is only a place to run mc from, so it just
			// waits.
			Entrypoint: []string{"sh"},
			Cmd:        []string{"-c", fmt.Sprintf("sleep %d", int(mcIdleLifetime.Seconds()))},
			Env:        []string{fmt.Sprintf("MC_HOST_%s=%s", mcAlias, endpoint.String())},
			Labels: map[string]string{
				"app":          "osi4iot",
				"osi4iot.role": "snapshot",
				"service_type": "mc_client",
			},
		},
		&container.HostConfig{AutoRemove: false},
		&network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				mcNetwork: {},
			},
		}, nil, mcContainerName)
	if err != nil {
		return nil, fmt.Errorf("error creating the MinIO client container: %w\n"+
			"It runs the platform's own MinIO image (%s) on the '%s' network; "+
			"is the platform running?", err, image, mcNetwork)
	}

	source := &mcSource{dc: dc, containerID: created.ID}
	rememberHelper(source)

	if err := dc.Cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		source.Close()
		return nil, fmt.Errorf("error starting the MinIO client container: %w", err)
	}

	// Prove the whole path in one go: mc exists, the network resolves
	// minio, and the credentials are accepted. Failing here is much
	// easier to act on than failing on the first object.
	if err := source.check(ctx); err != nil {
		source.Close()
		return nil, err
	}

	return source, nil
}

// check verifies mc can reach MinIO and is accepted by it.
//
// Lists the buckets rather than one named bucket: the bucket may not
// exist yet, since `init --snapshot-file` keeps admin_api — which used
// to create it — out of the first deployment, and EnsureBucket has not
// run at this point. What is being proved here is that mc is in the
// image, that the network resolves minio, and that the credentials are
// accepted; the bucket is the next step's problem.
func (m *mcSource) check(ctx context.Context) error {
	out, code, err := m.exec(ctx, []string{mcBinary, "--json", "ls", mcAlias})
	if err != nil {
		return fmt.Errorf("error running mc in the MinIO client container: %w", err)
	}
	if code != 0 {
		return fmt.Errorf("mc could not reach MinIO (exit %d):\n%s\n"+
			"Check that the minio service is running and that the platform admin "+
			"credentials in the state file are the ones MinIO was created with",
			code, strings.TrimSpace(out))
	}
	return nil
}

// Close removes the helper container. Safe to call more than once.
func (m *mcSource) Close() {
	if m == nil || m.containerID == "" {
		return
	}
	forgetHelper(m)

	// A fresh context: Close is normally reached through a defer or a
	// signal handler, by which point the caller's may be cancelled.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_ = m.dc.Cli.ContainerRemove(ctx, m.containerID, container.RemoveOptions{Force: true})
	m.containerID = ""
}

// exec runs one mc command to completion and returns its merged
// output and exit code.
//
// This exists instead of the package's execInContainer because that one
// runs everything against dc.Ctx and ignores the context it is given.
// Here the context is the caller's, which is what makes a Ctrl-C during
// `mc ls --recursive` over a WAL prefix of tens of thousands of
// segments stop the listing rather than wait it out.
//
// Streaming downloads do not go through here — see Get, which needs the
// bytes as they arrive rather than a buffered string.
func (m *mcSource) exec(ctx context.Context, cmd []string) (string, int, error) {
	created, err := m.dc.Cli.ContainerExecCreate(ctx, m.containerID, container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
	})
	if err != nil {
		return "", 0, fmt.Errorf("error creating exec: %w", err)
	}

	attached, err := m.dc.Cli.ContainerExecAttach(ctx, created.ID, container.ExecAttachOptions{})
	if err != nil {
		return "", 0, fmt.Errorf("error attaching to exec: %w", err)
	}
	defer attached.Close()

	// Docker multiplexes stdout and stderr on one stream unless the
	// container has a TTY; stdcopy splits them back out. Without this
	// the output comes back with 8-byte frame headers embedded in it.
	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, attached.Reader); err != nil {
		return "", 0, fmt.Errorf("error reading exec output: %w", err)
	}

	inspect, err := m.dc.Cli.ContainerExecInspect(ctx, created.ID)
	if err != nil {
		return "", 0, fmt.Errorf("error inspecting exec: %w", err)
	}

	out := stdout.String()
	if stderr.Len() > 0 {
		out += "\n" + stderr.String()
	}
	return out, inspect.ExitCode, nil
}

// mcEntry is one line of `mc ls --json`.
type mcEntry struct {
	Status       string `json:"status"`
	Type         string `json:"type"`
	Key          string `json:"key"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified"`
	Error        *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// List returns everything stored under keyPrefix.
//
// mc reports keys RELATIVE to the path it was asked about, so they are
// joined back onto the prefix here. The check is defensive: a version
// that returned absolute keys would otherwise produce keys with the
// prefix in them twice, and the failure would not show up until a
// download 404s.
func (m *mcSource) List(ctx context.Context, bucket, keyPrefix string) ([]s3Object, error) {
	target := mcAlias + "/" + path.Join(bucket, keyPrefix)

	out, code, err := m.exec(ctx, []string{mcBinary, "--json", "ls", "--recursive", target})
	if err != nil {
		return nil, fmt.Errorf("error listing s3://%s/%s: %w", bucket, keyPrefix, err)
	}

	var objects []s3Object
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}

		var entry mcEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			// mc writes non-JSON noise to stderr on some paths, and
			// exec merges the two streams. Skipping a line that will
			// not parse beats failing the whole snapshot.
			continue
		}

		if entry.Status == "error" {
			message := "unknown error"
			if entry.Error != nil && entry.Error.Message != "" {
				message = entry.Error.Message
			}
			// An empty prefix is not an error worth stopping for: a
			// platform that has never taken a NATS backup has nothing
			// under that prefix, and the caller handles that.
			if strings.Contains(strings.ToLower(message), "does not exist") {
				return nil, nil
			}
			return nil, fmt.Errorf("error listing s3://%s/%s: %s", bucket, keyPrefix, message)
		}

		if entry.Type == "folder" || entry.Key == "" || strings.HasSuffix(entry.Key, "/") {
			continue
		}

		key := entry.Key
		if keyPrefix != "" && !strings.HasPrefix(key, keyPrefix) {
			key = path.Join(keyPrefix, key)
		}

		objects = append(objects, s3Object{
			Key:     key,
			Size:    entry.Size,
			ModTime: parseMcTime(entry.LastModified),
		})
	}

	if code != 0 && len(objects) == 0 {
		return nil, fmt.Errorf("mc could not list s3://%s/%s (exit %d):\n%s",
			bucket, keyPrefix, code, strings.TrimSpace(out))
	}

	return objects, nil
}

// Get streams one object out of the bucket.
//
// `mc cat` writes the object to stdout, which Docker multiplexes with
// stderr; stdcopy demultiplexes into a pipe so the caller reads the
// bytes as they arrive rather than after the whole object has been
// buffered. A base backup partition will not fit in memory.
func (m *mcSource) Get(ctx context.Context, bucket, key string) (io.ReadCloser, error) {
	target := mcAlias + "/" + path.Join(bucket, key)

	execCfg := container.ExecOptions{
		Cmd:          []string{mcBinary, "cat", target},
		AttachStdout: true,
		AttachStderr: true,
	}
	created, err := m.dc.Cli.ContainerExecCreate(ctx, m.containerID, execCfg)
	if err != nil {
		return nil, fmt.Errorf("error creating the download of s3://%s/%s: %w", bucket, key, err)
	}

	attached, err := m.dc.Cli.ContainerExecAttach(ctx, created.ID, container.ExecAttachOptions{})
	if err != nil {
		return nil, fmt.Errorf("error attaching to the download of s3://%s/%s: %w", bucket, key, err)
	}

	reader, writer := io.Pipe()
	stream := &mcStream{
		dc:       m.dc,
		execID:   created.ID,
		reader:   reader,
		attached: attached.Close,
		bucket:   bucket,
		key:      key,
	}

	go func() {
		var stderr strings.Builder
		_, copyErr := stdcopy.StdCopy(writer, &stderr, attached.Reader)
		stream.stderr = stderr.String()
		writer.CloseWithError(copyErr)
	}()

	return stream, nil
}

// EnsureBucket creates the bucket if it is not there.
//
// --ignore-existing makes this idempotent, which matters because the
// seeding runs it every time and a platform that has been up before
// already has its bucket.
func (m *mcSource) EnsureBucket(ctx context.Context, bucket string) (bool, error) {
	// Asked first rather than relying on --ignore-existing alone,
	// because that flag makes success indistinguishable from "already
	// there" and the caller wants to report which it was.
	if _, code, err := m.exec(ctx, []string{mcBinary, "--json", "ls", mcAlias + "/" + bucket}); err == nil && code == 0 {
		return false, nil
	}

	out, code, err := m.exec(ctx, []string{mcBinary, "--quiet", "mb", "--ignore-existing",
		mcAlias + "/" + bucket})
	if err != nil {
		return false, fmt.Errorf("error creating the bucket '%s': %w", bucket, err)
	}
	if code != 0 {
		return false, fmt.Errorf("mc could not create the bucket '%s' (exit %d): %s",
			bucket, code, strings.TrimSpace(out))
	}
	return true, nil
}

// Empty deletes every object in the bucket.
//
// mc reports what it removed on stdout, one line per object, which is
// what is counted here rather than listing first and deleting second.
func (m *mcSource) Empty(ctx context.Context, bucket string) (int, error) {
	out, code, err := m.exec(ctx, []string{mcBinary, "rm", "--recursive", "--force",
		mcAlias + "/" + bucket})
	if err != nil {
		return 0, fmt.Errorf("error emptying the bucket '%s': %w", bucket, err)
	}
	if code != 0 {
		return 0, fmt.Errorf("mc could not empty the bucket '%s' (exit %d): %s",
			bucket, code, strings.TrimSpace(out))
	}

	deleted := 0
	for _, line := range strings.Split(out, "\n") {
		if strings.TrimSpace(line) != "" {
			deleted++
		}
	}
	return deleted, nil
}

func (m *mcSource) RemoveBucket(ctx context.Context, bucket string) error {
	out, code, err := m.exec(ctx, []string{mcBinary, "rb", "--force", mcAlias + "/" + bucket})
	if err != nil {
		return fmt.Errorf("error removing the bucket '%s': %w", bucket, err)
	}
	if code != 0 {
		return fmt.Errorf("mc could not remove the bucket '%s' (exit %d): %s",
			bucket, code, strings.TrimSpace(out))
	}
	return nil
}

// Put stores one object, streaming it in through `mc pipe`, which reads
// stdin and writes it to the given key.
//
// The counterpart to Get, and the same mechanics in reverse: the body
// goes down the hijacked connection's write half and CloseWrite is what
// tells mc the object has ended. Without that close mc waits on stdin
// forever and the upload never completes.
func (m *mcSource) Put(ctx context.Context, bucket, key string, size int64, body io.Reader) error {
	target := mcAlias + "/" + path.Join(bucket, key)

	created, err := m.dc.Cli.ContainerExecCreate(ctx, m.containerID, container.ExecOptions{
		Cmd:          []string{mcBinary, "--quiet", "pipe", target},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
	})
	if err != nil {
		return fmt.Errorf("error creating the upload of s3://%s/%s: %w", bucket, key, err)
	}

	attached, err := m.dc.Cli.ContainerExecAttach(ctx, created.ID, container.ExecAttachOptions{})
	if err != nil {
		return fmt.Errorf("error attaching to the upload of s3://%s/%s: %w", bucket, key, err)
	}
	defer attached.Close()

	// Drained concurrently rather than after the write. mc says little
	// here, but the two directions share one hijacked connection, and a
	// process that wrote enough to fill the output buffer while nobody
	// was reading would deadlock against our own io.Copy.
	drained := make(chan string, 1)
	go func() {
		var stdout, stderr bytes.Buffer
		_, _ = stdcopy.StdCopy(&stdout, &stderr, attached.Reader)
		drained <- strings.TrimSpace(stdout.String() + "\n" + stderr.String())
	}()

	written, copyErr := io.Copy(attached.Conn, body)
	closeErr := attached.CloseWrite()
	output := <-drained

	if copyErr != nil {
		return fmt.Errorf("error sending s3://%s/%s: %w", bucket, key, copyErr)
	}
	if closeErr != nil {
		return fmt.Errorf("error finishing s3://%s/%s: %w", bucket, key, closeErr)
	}
	if size > 0 && written != size {
		return fmt.Errorf("s3://%s/%s is %d bytes in the snapshot but %d were sent",
			bucket, key, size, written)
	}

	inspect, err := m.dc.Cli.ContainerExecInspect(ctx, created.ID)
	if err != nil {
		return fmt.Errorf("error checking the upload of s3://%s/%s: %w", bucket, key, err)
	}
	if inspect.ExitCode != 0 {
		if output == "" {
			output = fmt.Sprintf("mc exited with %d", inspect.ExitCode)
		}
		return fmt.Errorf("error uploading s3://%s/%s: %s", bucket, key, output)
	}

	return nil
}

// mcStream is the object's bytes, plus the exit status of the mc that
// produced them.
//
// The exit code matters: a failed `mc cat` writes nothing to stdout and
// would otherwise look exactly like a zero-byte object. snapshot's
// writer does compare the bytes copied against the size the listing
// reported, so a truncated download is caught either way, but an error
// naming the object is a better thing to hand the operator than a size
// mismatch.
type mcStream struct {
	dc       *pt.DockerClient
	execID   string
	reader   *io.PipeReader
	attached func()
	stderr   string
	bucket   string
	key      string
	checked  bool
}

func (s *mcStream) Read(p []byte) (int, error) {
	n, err := s.reader.Read(p)
	if err == io.EOF {
		if checkErr := s.check(); checkErr != nil {
			return n, checkErr
		}
	}
	return n, err
}

func (s *mcStream) Close() error {
	err := s.check()
	s.reader.Close()
	if s.attached != nil {
		s.attached()
		s.attached = nil
	}
	return err
}

// check asks Docker how the exec ended. Runs once.
func (s *mcStream) check() error {
	if s.checked {
		return nil
	}
	s.checked = true

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	inspect, err := s.dc.Cli.ContainerExecInspect(ctx, s.execID)
	if err != nil {
		return fmt.Errorf("error checking the download of s3://%s/%s: %w", s.bucket, s.key, err)
	}
	if inspect.Running {
		// Reached EOF on stdout while mc is still going: it is about to
		// exit, and waiting a moment is cheaper than reporting a status
		// that does not exist yet.
		time.Sleep(200 * time.Millisecond)
		if inspect, err = s.dc.Cli.ContainerExecInspect(ctx, s.execID); err != nil {
			return fmt.Errorf("error checking the download of s3://%s/%s: %w", s.bucket, s.key, err)
		}
	}
	if inspect.ExitCode != 0 {
		message := strings.TrimSpace(s.stderr)
		if message == "" {
			message = fmt.Sprintf("mc exited with %d", inspect.ExitCode)
		}
		return fmt.Errorf("error downloading s3://%s/%s: %s", s.bucket, s.key, message)
	}
	return nil
}

// removeStaleMcContainer clears a helper left behind by an interrupted
// run.
func removeStaleMcContainer(ctx context.Context, dc *pt.DockerClient) {
	f := filters.NewArgs()
	f.Add("name", mcContainerName)
	existing, err := dc.Cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return
	}
	for _, c := range existing {
		_ = dc.Cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true})
	}
}

// parseMcTime reads mc's timestamps, which are RFC3339 with a variable
// number of fractional digits.
func parseMcTime(value string) time.Time {
	if value == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC()
		}
	}
	return time.Time{}
}