package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// rcloneSource reads and writes the platform's Garage through `rclone`,
// running in a throwaway container on the platform's own overlay network.
//
// # Why this shape
//
// Garage is only reachable from inside internal_net: it publishes no
// host port outside development mode, and it has no Traefik route. So
// something has to run inside the network. The platform's own Garage
// image carries rclone for exactly this, which means no extra image on
// the nodes, no published port and no TCP forwarding: the objects come
// out through the Docker exec API, the channel the CLI already uses for
// everything else and which works unchanged over SSH.
//
// rclone gets its whole configuration from RCLONE_CONFIG_<REMOTE>_*
// environment variables, so no config file holding a secret is written
// in the container. It authenticates with the CLI's own Garage key
// (utils.S3ConsumerCLI), never with an administrator's credentials.
//
// # What it costs
//
// One exec per object. For a WAL directory of thousands of small
// segments that is thousands of round trips — but each one streams,
// nothing is staged on the node's disk, and on a real snapshot the base
// backup dominates, not the segment count.

const (
	// rcloneContainerName is fixed rather than random so an interrupted
	// run leaves something findable that the next attempt can clear,
	// instead of failing on a name clash.
	rcloneContainerName = "osi4iot-s3-rclone"

	// rcloneNetwork is the overlay the garage service is reachable by
	// name on. networks.GenerateNetworks makes it Attachable, which is
	// what lets a standalone container join it.
	rcloneNetwork = "internal_net"

	// rcloneRemote is the name of the remote the RCLONE_CONFIG_* variables
	// define.
	rcloneRemote = "plat"

	// rcloneIdleLifetime bounds how long the helper can outlive the CLI
	// if something goes very wrong — a crash that skips both the
	// deferred Close and CleanResources.
	rcloneIdleLifetime = 24 * time.Hour

	// rcloneExitDirNotFound is rclone's documented exit code for
	// "directory not found": what listing an empty prefix gives.
	rcloneExitDirNotFound = 3
)

// rcloneEnv configures the remote. Exported values of rclone's s3
// backend options:
//
//   - provider Other: rclone has no Garage profile; "Other" is generic
//     S3 with v4 signatures, which is what Garage's documentation uses.
//   - region: the platform's single S3 region — Garage verifies it.
//   - force_path_style: Garage is addressed by service name, there is
//     no virtual-host DNS.
//   - no_check_bucket: never try to create a bucket before writing. The
//     CLI's key may not create buckets, and the bucket always exists.
func rcloneEnv(endpoint string, creds pt.S3Credentials) []string {
	prefix := "RCLONE_CONFIG_" + strings.ToUpper(rcloneRemote) + "_"
	return []string{
		prefix + "TYPE=s3",
		prefix + "PROVIDER=Other",
		prefix + "ENV_AUTH=false",
		prefix + "ACCESS_KEY_ID=" + creds.AccessKeyID,
		prefix + "SECRET_ACCESS_KEY=" + creds.SecretAccessKey,
		prefix + "REGION=" + utils.GarageS3Region,
		prefix + "ENDPOINT=" + endpoint,
		prefix + "FORCE_PATH_STYLE=true",
		prefix + "NO_CHECK_BUCKET=true",
		// No config file: everything is in the environment above, and
		// without this rclone prints a notice about the missing file on
		// every single command.
		"RCLONE_CONFIG=/dev/null",
	}
}

// rcloneTarget renders "plat:bucket/key".
func rcloneTarget(bucket, key string) string {
	return rcloneRemote + ":" + path.Join(bucket, key)
}

type rcloneSource struct {
	cli         *client.Client
	containerID string
	// env is passed to every exec rather than set on the container only,
	// so the same source works inside the recovery container too, which
	// is created before the key it reads with exists.
	env []string
}

// startRcloneSource brings up the helper container and proves it can
// reach Garage before returning.
func startRcloneSource(
	ctx context.Context,
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	image string,
	creds pt.S3Credentials,
	logger *log.Logger,
) (*rcloneSource, error) {
	if dc == nil || dc.Cli == nil {
		return nil, fmt.Errorf("no docker client to reach Garage with")
	}
	if image == "" {
		image = utils.GetServiceImage(pd, utils.GarageServiceName, utils.DefaultGarageImage)
	}

	removeStaleContainer(ctx, dc.Cli, rcloneContainerName)

	if logger != nil {
		logger.Printf("Starting an S3 client (rclone) on the platform network...")
	}
	// The helper runs on the manager, which usually runs no Garage
	// instance and so has never pulled the image.
	if err := ensureImage(ctx, dc.Cli, image); err != nil {
		return nil, err
	}

	created, err := dc.Cli.ContainerCreate(ctx,
		&container.Config{
			Image: image,
			// The image's entrypoint passes any command other than
			// "server" straight through: this container is only a place
			// to run rclone from, so it just waits.
			Cmd: []string{"sleep", strconv.Itoa(int(rcloneIdleLifetime.Seconds()))},
			Labels: map[string]string{
				"app":          "osi4iot",
				"osi4iot.role": "snapshot",
				"service_type": "rclone_client",
			},
		},
		rcloneHelperHostConfig(),
		&network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				rcloneNetwork: {},
			},
		}, nil, rcloneContainerName)
	if err != nil {
		return nil, fmt.Errorf("error creating the S3 client container: %w\n"+
			"It runs the platform's Garage image (%s) on the '%s' network; "+
			"is the platform running?", err, image, rcloneNetwork)
	}

	source := &rcloneSource{
		cli:         dc.Cli,
		containerID: created.ID,
		env:         rcloneEnv(utils.GarageS3Endpoint, creds),
	}
	rememberHelper(source)

	if err := dc.Cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		source.Close()
		return nil, fmt.Errorf("error starting the S3 client container: %w", err)
	}

	if err := source.check(ctx); err != nil {
		source.Close()
		return nil, err
	}
	return source, nil
}

// check proves the whole path in one go: rclone is in the image, the
// network resolves garage, and the key is accepted. Lists the buckets
// the key can see rather than one bucket, which may not be provisioned
// yet — that is EnsureBucket's business.
func (r *rcloneSource) check(ctx context.Context) error {
	stdout, stderr, code, err := r.exec(ctx, []string{"rclone", "lsjson", "--dirs-only", rcloneRemote + ":"})
	if err != nil {
		return fmt.Errorf("error running rclone in the S3 client container: %w", err)
	}
	if code != 0 {
		return fmt.Errorf("rclone could not reach Garage (exit %d):\n%s\n"+
			"Check that the garage service is running and healthy, and that the CLI's "+
			"S3 key in the state file is the one Garage was provisioned with",
			code, strings.TrimSpace(stdout+"\n"+stderr))
	}
	return nil
}

// Close removes the helper container. Safe to call more than once.
func (r *rcloneSource) Close() {
	if r == nil || r.containerID == "" {
		return
	}
	forgetHelper(r)

	// A fresh context: Close is normally reached through a defer or a
	// signal handler, by which point the caller's may be cancelled.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_ = r.cli.ContainerRemove(ctx, r.containerID, container.RemoveOptions{Force: true, RemoveVolumes: true})
	r.containerID = ""
}

func (r *rcloneSource) exec(ctx context.Context, cmd []string) (string, string, int, error) {
	return execCapture(ctx, r.cli, r.containerID, cmd, r.env)
}

// rcloneEntry is one element of `rclone lsjson`.
type rcloneEntry struct {
	Path    string `json:"Path"`
	Name    string `json:"Name"`
	Size    int64  `json:"Size"`
	ModTime string `json:"ModTime"`
	IsDir   bool   `json:"IsDir"`
}

// parseRcloneList turns `rclone lsjson -R --files-only` output into
// objects. rclone reports paths RELATIVE to what it was asked to list,
// so they are joined back onto keyPrefix.
func parseRcloneList(out, keyPrefix string) ([]s3Object, error) {
	out = strings.TrimSpace(out)
	if out == "" {
		return nil, nil
	}
	var entries []rcloneEntry
	if err := json.Unmarshal([]byte(out), &entries); err != nil {
		return nil, fmt.Errorf("unexpected rclone listing: %w", err)
	}
	objects := make([]s3Object, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir || entry.Path == "" {
			continue
		}
		key := entry.Path
		if keyPrefix != "" {
			key = path.Join(keyPrefix, entry.Path)
		}
		objects = append(objects, s3Object{
			Key:     key,
			Size:    entry.Size,
			ModTime: parseRcloneTime(entry.ModTime),
		})
	}
	return objects, nil
}

// List returns everything stored under keyPrefix. A prefix with nothing
// under it is an empty list, not an error: a platform that has never
// taken a NATS backup has nothing there, and callers handle that.
func (r *rcloneSource) List(ctx context.Context, bucket, keyPrefix string) ([]s3Object, error) {
	keyPrefix = strings.Trim(keyPrefix, "/")
	stdout, stderr, code, err := r.exec(ctx, []string{
		"rclone", "lsjson", "--recursive", "--files-only", "--no-mimetype",
		// LastModified as S3 reports it, rather than the mtime rclone
		// itself stores in metadata — objects written by wal-g, admin_api
		// or system_manager have none.
		"--use-server-modtime",
		rcloneTarget(bucket, keyPrefix),
	})
	if err != nil {
		return nil, fmt.Errorf("error listing s3://%s/%s: %w", bucket, keyPrefix, err)
	}
	if code == rcloneExitDirNotFound {
		return nil, nil
	}
	if code != 0 {
		return nil, fmt.Errorf("rclone could not list s3://%s/%s (exit %d):\n%s",
			bucket, keyPrefix, code, strings.TrimSpace(stderr))
	}
	objects, err := parseRcloneList(stdout, keyPrefix)
	if err != nil {
		return nil, fmt.Errorf("error listing s3://%s/%s: %w", bucket, keyPrefix, err)
	}
	return objects, nil
}

// BucketExists reports whether the key can see the bucket.
func (r *rcloneSource) BucketExists(ctx context.Context, bucket string) (bool, error) {
	stdout, stderr, code, err := r.exec(ctx, []string{"rclone", "lsjson", "--dirs-only", rcloneRemote + ":"})
	if err != nil {
		return false, err
	}
	if code != 0 {
		return false, fmt.Errorf("rclone could not list the buckets (exit %d): %s",
			code, strings.TrimSpace(stderr))
	}
	var entries []rcloneEntry
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &entries); err != nil {
		return false, fmt.Errorf("unexpected rclone listing: %w", err)
	}
	for _, entry := range entries {
		if entry.Name == bucket || entry.Path == bucket {
			return true, nil
		}
	}
	return false, nil
}

// EnsureBucket is only ever reached through garageStore, which owns
// bucket creation for Garage; see garageStore.EnsureBucket.
func (r *rcloneSource) EnsureBucket(ctx context.Context, bucket string) (bool, error) {
	exists, err := r.BucketExists(ctx, bucket)
	if err != nil {
		return false, err
	}
	if !exists {
		return false, fmt.Errorf("the bucket '%s' does not exist", bucket)
	}
	return false, nil
}

// Get streams one object out of the bucket.
//
// `rclone cat` writes the object to stdout, which Docker multiplexes
// with stderr; stdcopy demultiplexes into a pipe so the caller reads the
// bytes as they arrive. A base backup partition does not fit in memory.
func (r *rcloneSource) Get(ctx context.Context, bucket, key string) (io.ReadCloser, error) {
	created, err := r.cli.ContainerExecCreate(ctx, r.containerID, container.ExecOptions{
		Cmd:          []string{"rclone", "cat", rcloneTarget(bucket, key)},
		Env:          r.env,
		AttachStdout: true,
		AttachStderr: true,
	})
	if err != nil {
		return nil, fmt.Errorf("error creating the download of s3://%s/%s: %w", bucket, key, err)
	}
	attached, err := r.cli.ContainerExecAttach(ctx, created.ID, container.ExecAttachOptions{})
	if err != nil {
		return nil, fmt.Errorf("error attaching to the download of s3://%s/%s: %w", bucket, key, err)
	}

	reader, writer := io.Pipe()
	stream := &execStream{
		cli:      r.cli,
		execID:   created.ID,
		reader:   reader,
		attached: attached.Close,
		what:     fmt.Sprintf("s3://%s/%s", bucket, key),
	}
	go func() {
		var stderr strings.Builder
		_, copyErr := stdcopy.StdCopy(writer, &stderr, attached.Reader)
		stream.stderr = stderr.String()
		writer.CloseWithError(copyErr)
	}()
	return stream, nil
}

// Put stores one object, streamed in through `rclone rcat`, which reads
// stdin. --size tells rclone the length up front, so an object below the
// multipart cutoff goes out as a single PutObject. CloseWrite is what
// tells rclone the object has ended.
func (r *rcloneSource) Put(ctx context.Context, bucket, key string, size int64, body io.Reader) error {
	cmd := []string{"rclone", "rcat"}
	if size >= 0 {
		cmd = append(cmd, "--size", strconv.FormatInt(size, 10))
	}
	cmd = append(cmd, rcloneTarget(bucket, key))

	created, err := r.cli.ContainerExecCreate(ctx, r.containerID, container.ExecOptions{
		Cmd:          cmd,
		Env:          r.env,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
	})
	if err != nil {
		return fmt.Errorf("error creating the upload of s3://%s/%s: %w", bucket, key, err)
	}
	attached, err := r.cli.ContainerExecAttach(ctx, created.ID, container.ExecAttachOptions{})
	if err != nil {
		return fmt.Errorf("error attaching to the upload of s3://%s/%s: %w", bucket, key, err)
	}
	defer attached.Close()

	// Drained concurrently: both directions share one hijacked
	// connection, and a process that filled its output buffer while
	// nobody read it would deadlock against our own io.Copy.
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

	inspect, err := r.cli.ContainerExecInspect(ctx, created.ID)
	if err != nil {
		return fmt.Errorf("error checking the upload of s3://%s/%s: %w", bucket, key, err)
	}
	if inspect.ExitCode != 0 {
		if output == "" {
			output = fmt.Sprintf("rclone exited with %d", inspect.ExitCode)
		}
		return fmt.Errorf("error uploading s3://%s/%s: %s", bucket, key, output)
	}
	return nil
}

// Empty deletes every object in the bucket and leaves the bucket.
// Counted from a listing first: `rclone delete` says nothing on success.
func (r *rcloneSource) Empty(ctx context.Context, bucket string) (int, error) {
	objects, err := r.List(ctx, bucket, "")
	if err != nil {
		return 0, err
	}
	if len(objects) == 0 {
		return 0, nil
	}
	_, stderr, code, err := r.exec(ctx, []string{"rclone", "delete", rcloneTarget(bucket, "")})
	if err != nil {
		return 0, fmt.Errorf("error emptying the bucket '%s': %w", bucket, err)
	}
	if code != 0 {
		return 0, fmt.Errorf("rclone could not empty the bucket '%s' (exit %d): %s",
			bucket, code, strings.TrimSpace(stderr))
	}
	return len(objects), nil
}

// RemoveBucket is refused: no key the platform hands out holds Garage's
// "owner" permission, which DeleteBucket needs. A Garage bucket goes
// with the garage volumes.
func (r *rcloneSource) RemoveBucket(ctx context.Context, bucket string) error {
	return errGarageBucketManaged(bucket)
}

func errGarageBucketManaged(bucket string) error {
	return fmt.Errorf("the bucket '%s' is managed by the garage service's provisioning "+
		"and removed together with the garage_meta and garage_data volumes", bucket)
}

// parseRcloneTime reads rclone's timestamps: RFC3339 with a variable
// number of fractional digits.
func parseRcloneTime(value string) time.Time {
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

// ── Exec plumbing shared with the recovery container ────────────────

// execCapture runs one command to completion in a container and returns
// its stdout and stderr separately, and its exit code.
//
// Separately because rclone and garage both write JSON on stdout and
// notices on stderr; merged, the JSON stops being JSON.
//
// The context is the caller's, which is what makes a Ctrl-C during a
// listing of tens of thousands of WAL segments stop the listing.
func execCapture(ctx context.Context, cli *client.Client, containerID string, cmd, env []string) (string, string, int, error) {
	created, err := cli.ContainerExecCreate(ctx, containerID, container.ExecOptions{
		Cmd:          cmd,
		Env:          env,
		AttachStdout: true,
		AttachStderr: true,
	})
	if err != nil {
		return "", "", 0, fmt.Errorf("error creating exec: %w", err)
	}
	attached, err := cli.ContainerExecAttach(ctx, created.ID, container.ExecAttachOptions{})
	if err != nil {
		return "", "", 0, fmt.Errorf("error attaching to exec: %w", err)
	}
	defer attached.Close()

	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, attached.Reader); err != nil {
		return "", "", 0, fmt.Errorf("error reading exec output: %w", err)
	}
	inspect, err := cli.ContainerExecInspect(ctx, created.ID)
	if err != nil {
		return "", "", 0, fmt.Errorf("error inspecting exec: %w", err)
	}
	return stdout.String(), stderr.String(), inspect.ExitCode, nil
}

// execStream is a streamed exec's stdout plus the exit status of the
// process that produced it.
//
// The exit code matters: a failed `rclone cat` writes nothing to stdout
// and would otherwise look exactly like a zero-byte object.
type execStream struct {
	cli      *client.Client
	execID   string
	reader   *io.PipeReader
	attached func()
	stderr   string
	what     string
	checked  bool
}

func (s *execStream) Read(p []byte) (int, error) {
	n, err := s.reader.Read(p)
	if err == io.EOF {
		if checkErr := s.check(); checkErr != nil {
			return n, checkErr
		}
	}
	return n, err
}

func (s *execStream) Close() error {
	err := s.check()
	s.reader.Close()
	if s.attached != nil {
		s.attached()
		s.attached = nil
	}
	return err
}

// check asks Docker how the exec ended. Runs once.
func (s *execStream) check() error {
	if s.checked {
		return nil
	}
	s.checked = true

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	inspect, err := s.cli.ContainerExecInspect(ctx, s.execID)
	if err != nil {
		return fmt.Errorf("error checking the download of %s: %w", s.what, err)
	}
	// EOF on stdout can arrive a moment before the process has exited.
	for i := 0; inspect.Running && i < 25; i++ {
		time.Sleep(200 * time.Millisecond)
		if inspect, err = s.cli.ContainerExecInspect(ctx, s.execID); err != nil {
			return fmt.Errorf("error checking the download of %s: %w", s.what, err)
		}
	}
	if inspect.ExitCode != 0 {
		message := strings.TrimSpace(s.stderr)
		if message == "" {
			message = fmt.Sprintf("exited with %d", inspect.ExitCode)
		}
		return fmt.Errorf("error downloading %s: %s", s.what, message)
	}
	return nil
}

// garageImageVolumes are the paths the Garage image declares as VOLUME.
// Every container started from it without something mounted there gets
// an anonymous volume for each, left behind when the container goes.
var garageImageVolumes = []string{"/var/lib/garage/meta", "/var/lib/garage/data"}

// rcloneHelperHostConfig is the helper's host configuration: tmpfs over
// the Garage image's VOLUME paths, so no anonymous volume is created at
// all — not even when the CLI is interrupted before cleaning up. rclone
// only streams to and from S3; it never writes there.
func rcloneHelperHostConfig() *container.HostConfig {
	tmpfs := make(map[string]string, len(garageImageVolumes))
	for _, path := range garageImageVolumes {
		tmpfs[path] = ""
	}
	return &container.HostConfig{AutoRemove: false, Tmpfs: tmpfs}
}

// removeStaleContainer clears a helper left behind by an interrupted run.
func removeStaleContainer(ctx context.Context, cli *client.Client, name string) {
	f := filters.NewArgs()
	f.Add("name", name)
	existing, err := cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return
	}
	for _, c := range existing {
		_ = cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true, RemoveVolumes: true})
	}
}

// ensureImage pulls an image the node does not have. Creating a
// container through the API does not pull, unlike `docker run`: a
// helper on a node that never ran the image fails with "No such image".
func ensureImage(ctx context.Context, cli *client.Client, ref string) error {
	if _, _, err := cli.ImageInspectWithRaw(ctx, ref); err == nil {
		return nil
	}
	rc, err := cli.ImagePull(ctx, ref, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("error pulling %s: %w", ref, err)
	}
	defer rc.Close()
	// The pull runs while its progress stream is read.
	if _, err := io.Copy(io.Discard, rc); err != nil {
		return fmt.Errorf("error pulling %s: %w", ref, err)
	}
	if _, _, err := cli.ImageInspectWithRaw(ctx, ref); err != nil {
		return fmt.Errorf("%s could not be pulled on this node: %w", ref, err)
	}
	return nil
}
