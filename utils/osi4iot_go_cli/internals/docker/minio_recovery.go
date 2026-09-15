package docker

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/docker/go-connections/nat"
)

// This file recovers a state file backup from a MinIO deployment whose
// platform is stopped — the one case the rest of the recovery story
// doesn't cover.
//
// Everywhere else, getting the backup is somebody else's problem in a
// good way: with AWS S3 the bucket is reachable whatever the platform
// is doing, and with MinIO running there is a console at
// https://<domain>/minio. Either way the operator downloads the object
// by hand and `osi4iot state restore --file` takes it from there.
//
// With MinIO stopped there is no endpoint at all. Credentials don't
// help — nothing is listening. The objects sit in the minio_storage
// volume on whichever node last ran the service, and the only way to
// read them is to put a MinIO in front of that volume again.
//
// # Why the real root credentials are required
//
// MinIO encrypts its own config and IAM data under .minio.sys with a
// key derived from MINIO_ROOT_USER/MINIO_ROOT_PASSWORD — which is why
// rotating them on a live deployment needs MINIO_ROOT_USER_OLD /
// MINIO_ROOT_PASSWORD_OLD. Starting a container with made-up
// credentials against an existing data directory fails to initialize
// the IAM subsystem rather than quietly ignoring what's there.
//
// That is not the obstacle it sounds like: those credentials are
// PlatformAdminUserName/PlatformAdminPassword, typed by the operator at
// platform creation (see ui/form/initPlatform.go) and used daily for
// Grafana, pgAdmin and the MinIO console. Unlike a random key, this is
// something a person actually knows.
//
// # Nothing is exposed to the network
//
// MinIO is published on the target host's loopback only, on a port
// Docker picks, and reached through the SSH connection the target
// already has (see RecoveryTarget.Dial). For those seconds that
// container is a door onto every credential the platform holds, and it
// has no business being reachable from anywhere else.

const (
	// minioStorageVolume is the volume MinioService mounts at /mnt/data
	// — the MinIO data directory, holding both the buckets and
	// .minio.sys. minio_data (mounted at /data) is not it.
	minioStorageVolume = "minio_storage"
	// minioDataDir is where this file mounts that volume, matching what
	// the real service does so MinIO sees an identical layout.
	minioDataDir = "/mnt/data"
	// recoveryContainerName is fixed rather than random so that a run
	// interrupted before its cleanup leaves something findable, and the
	// next attempt can clear it instead of failing on a name clash.
	recoveryContainerName = "osi4iot-recovery-minio"
	// DefaultMinioImage matches internals/services/minio.go. Recovery
	// should run the SAME MinIO version that wrote the volume: a newer
	// one may want to migrate the on-disk format, which is not
	// something to discover in the middle of a recovery.
	DefaultMinioImage = "ghcr.io/osi4iot/minio:RELEASE.2023-10-16T04-13-43Z"
	// stateFileMarker identifies backup objects among everything else
	// in the bucket, matching the prefix ui/form/actions.go builds
	// ("s3://<bucket>/backups/state_file") and the ".enc" suffix
	// system_manager's statefile package names runs with.
	stateFileMarker = "state_file/"
	stateFileSuffix = ".enc"

	minioPort = nat.Port("9000/tcp")
)

// HasMinioStorageVolume reports whether the target holds the volume.
// Used to pick a node without asking: the CLI tries the local host,
// then each node it knows about, and stops at the first one that has
// it.
func HasMinioStorageVolume(ctx context.Context, target *RecoveryTarget) (bool, error) {
	list, err := target.Cli.VolumeList(ctx, volume.ListOptions{Filters: filters.NewArgs()})
	if err != nil {
		return false, fmt.Errorf("error listing volumes on %s: %w", target.Name, err)
	}
	for _, v := range list.Volumes {
		if v.Name == minioStorageVolume {
			return true, nil
		}
	}
	return false, nil
}

// TempMinio is a MinIO container started against an existing volume on
// a RecoveryTarget. Always defer Stop.
type TempMinio struct {
	endpoint    string
	containerID string
	target      *RecoveryTarget
	ctx         context.Context
}

// StartTempMinio brings up a throwaway MinIO in front of the target's
// minio_storage volume and waits for it to answer.
//
// rootUser/rootPassword must be the platform's real MinIO credentials
// (the platform admin user and password) — see this file's comment.
// image should be the same MinIO version the platform ran;
// DefaultMinioImage is that version as of writing.
func StartTempMinio(ctx context.Context, target *RecoveryTarget, rootUser, rootPassword, image string) (*TempMinio, error) {
	if rootUser == "" || rootPassword == "" {
		return nil, fmt.Errorf("MinIO root user and password are required")
	}
	if image == "" {
		image = DefaultMinioImage
	}

	hasVolume, err := HasMinioStorageVolume(ctx, target)
	if err != nil {
		return nil, err
	}
	if !hasVolume {
		return nil, fmt.Errorf("no '%s' volume on %s.\n"+
			"The volume is on whichever node last ran MinIO — 'docker volume ls' there will "+
			"confirm it.\nIf 'osi4iot delete' was run, the volume is gone and so are the backups",
			minioStorageVolume, target.Name)
	}

	// A previous run killed before its cleanup would otherwise make
	// this fail on a name clash — and leave its MinIO serving the
	// platform's credentials in the meantime.
	removeStaleRecoveryContainer(ctx, target)

	created, err := target.Cli.ContainerCreate(ctx,
		&container.Config{
			Image: image,
			Env: []string{
				"MINIO_ROOT_USER=" + rootUser,
				"MINIO_ROOT_PASSWORD=" + rootPassword,
			},
			Cmd:          []string{"server", minioDataDir, "--address", ":9000"},
			ExposedPorts: nat.PortSet{minioPort: struct{}{}},
			Labels: map[string]string{
				"app":          "osi4iot",
				"osi4iot.role": "recovery",
				"service_type": "minio_recovery",
			},
		},
		&container.HostConfig{
			Mounts: []mount.Mount{{
				Type:   mount.TypeVolume,
				Source: minioStorageVolume,
				Target: minioDataDir,
			}},
			PortBindings: nat.PortMap{
				minioPort: []nat.PortBinding{{HostIP: "127.0.0.1", HostPort: ""}},
			},
		}, nil, nil, recoveryContainerName)
	if err != nil {
		return nil, fmt.Errorf("error creating the temporary MinIO container on %s "+
			"(is the image %s present there?): %w", target.Name, image, err)
	}

	tm := &TempMinio{containerID: created.ID, target: target, ctx: ctx}

	if err := target.Cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		tm.Stop()
		return nil, fmt.Errorf("error starting the temporary MinIO container: %w", err)
	}

	port, err := publishedPort(ctx, target, created.ID)
	if err != nil {
		tm.Stop()
		return nil, err
	}
	// Loopback FROM THE TARGET'S POINT OF VIEW — target.Dial resolves
	// it there, over SSH when the target is remote.
	tm.endpoint = fmt.Sprintf("http://127.0.0.1:%s", port)

	if err := waitForMinio(ctx, target, tm.endpoint); err != nil {
		// The most likely cause by far is wrong credentials: MinIO
		// cannot decrypt .minio.sys and exits during IAM init rather
		// than serving. Say so, because "timed out" on its own would
		// send the operator looking at the wrong thing.
		logs := tm.tailLogs()
		tm.Stop()
		return nil, fmt.Errorf("the temporary MinIO did not come up: %w\n"+
			"The usual cause is wrong root credentials — MinIO encrypts its own config "+
			"with them and cannot start against this volume without the originals.%s", err, logs)
	}

	return tm, nil
}

// Endpoint is the URL the temporary MinIO answers on, as seen from the
// target host.
func (t *TempMinio) Endpoint() string { return t.endpoint }

// Stop removes the container. Safe to call more than once, and worth
// calling as early as possible: while it runs, the container is an
// unauthenticated-to-the-host window onto the platform's secrets.
func (t *TempMinio) Stop() {
	if t == nil || t.target == nil || t.containerID == "" {
		return
	}
	// A fresh context: Stop is usually reached through a defer or a
	// signal handler, by which point the caller's context may already
	// be cancelled — and leaving the container running is exactly what
	// must not happen.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_ = t.target.Cli.ContainerRemove(ctx, t.containerID, container.RemoveOptions{Force: true})
	t.containerID = ""
}

// tailLogs returns the container's last few lines, for the error path.
func (t *TempMinio) tailLogs() string {
	if t.target == nil || t.containerID == "" {
		return ""
	}
	rc, err := t.target.Cli.ContainerLogs(t.ctx, t.containerID, container.LogsOptions{
		ShowStdout: true, ShowStderr: true, Tail: "10",
	})
	if err != nil {
		return ""
	}
	defer rc.Close()

	// Demultiplexed, not read raw: without a TTY, stdout and stderr
	// arrive interleaved in 8-byte-framed chunks, and reading them
	// straight through puts frame headers in the middle of the text.
	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, io.LimitReader(rc, 64<<10)); err != nil {
		return ""
	}

	out := strings.TrimSpace(stdout.String() + "\n" + stderr.String())
	if out == "" {
		return ""
	}
	return "\n\nMinIO said:\n" + out
}

// removeStaleRecoveryContainer clears a container left behind by an
// interrupted run.
func removeStaleRecoveryContainer(ctx context.Context, target *RecoveryTarget) {
	f := filters.NewArgs()
	f.Add("name", recoveryContainerName)
	existing, err := target.Cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return
	}
	for _, c := range existing {
		_ = target.Cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true})
	}
}

// StateFileObject locates one backup inside MinIO.
type StateFileObject struct {
	Bucket string
	Key    string
}

// Name is the run's identifier, the object key without its path or
// extension — the same name `osi4iot state list` shows.
func (o StateFileObject) Name() string {
	base := o.Key
	if i := strings.LastIndex(base, "/"); i >= 0 {
		base = base[i+1:]
	}
	return strings.TrimSuffix(base, stateFileSuffix)
}

// ListStateFileBackupsInMinio finds every state file backup the
// temporary MinIO can see, newest first.
//
// It searches rather than asking for a bucket and prefix, because in
// the situation this runs in the operator has no state file to read
// them out of — and the objects are recognizable on their own: under a
// "state_file/" path, ending in ".enc".
func ListStateFileBackupsInMinio(ctx context.Context, tm *TempMinio, rootUser, rootPassword string) ([]StateFileObject, error) {
	svc, err := minioS3Client(ctx, tm, rootUser, rootPassword)
	if err != nil {
		return nil, err
	}

	buckets, err := svc.ListBuckets(ctx, &s3.ListBucketsInput{})
	if err != nil {
		return nil, fmt.Errorf("error listing buckets: %w", err)
	}

	var found []StateFileObject
	for _, b := range buckets.Buckets {
		bucket := aws.ToString(b.Name)
		paginator := s3.NewListObjectsV2Paginator(svc, &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket),
		})
		for paginator.HasMorePages() {
			page, err := paginator.NextPage(ctx)
			if err != nil {
				return nil, fmt.Errorf("error listing objects in %s: %w", bucket, err)
			}
			for _, obj := range page.Contents {
				key := aws.ToString(obj.Key)
				if strings.Contains(key, stateFileMarker) && strings.HasSuffix(key, stateFileSuffix) {
					found = append(found, StateFileObject{Bucket: bucket, Key: key})
				}
			}
		}
	}

	// Run names are timestamps that sort lexicographically in
	// chronological order (see system_manager's statefile package), so
	// reversing gives newest first.
	sort.Slice(found, func(i, j int) bool { return found[i].Key > found[j].Key })
	return found, nil
}

// DownloadFromMinio fetches one backup's bytes.
func DownloadFromMinio(ctx context.Context, tm *TempMinio, rootUser, rootPassword string, obj StateFileObject) ([]byte, error) {
	svc, err := minioS3Client(ctx, tm, rootUser, rootPassword)
	if err != nil {
		return nil, err
	}

	out, err := svc.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(obj.Bucket),
		Key:    aws.String(obj.Key),
	})
	if err != nil {
		return nil, fmt.Errorf("error downloading %s/%s: %w", obj.Bucket, obj.Key, err)
	}
	defer out.Body.Close()

	data, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading %s/%s: %w", obj.Bucket, obj.Key, err)
	}
	return data, nil
}

// minioS3Client builds an S3 client whose connections are opened from
// the target host, so the endpoint's 127.0.0.1 means MinIO's loopback
// binding there.
//
// Path style because MinIO on a bare address has no virtual-host
// addressing, and a fixed region because MinIO ignores it while the SDK
// insists on one.
func minioS3Client(ctx context.Context, tm *TempMinio, user, password string) (*s3.Client, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion("us-east-1"),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(user, password, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("error building the S3 client: %w", err)
	}

	httpClient := &http.Client{
		Transport: &http.Transport{DialContext: tm.target.Dial},
		Timeout:   2 * time.Minute,
	}
	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(tm.endpoint)
		o.UsePathStyle = true
		o.HTTPClient = httpClient
	}), nil
}

// publishedPort reads back the host port Docker chose.
func publishedPort(ctx context.Context, target *RecoveryTarget, containerID string) (string, error) {
	info, err := target.Cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return "", fmt.Errorf("error inspecting the temporary MinIO container: %w", err)
	}
	bindings := info.NetworkSettings.Ports[minioPort]
	if len(bindings) == 0 || bindings[0].HostPort == "" {
		return "", fmt.Errorf("the temporary MinIO container has no published port")
	}
	return bindings[0].HostPort, nil
}

// waitForMinio polls MinIO's own liveness endpoint until it answers,
// through the target's dialer.
func waitForMinio(ctx context.Context, target *RecoveryTarget, endpoint string) error {
	deadline := time.Now().Add(45 * time.Second)
	httpClient := &http.Client{
		Transport: &http.Transport{DialContext: target.Dial},
		Timeout:   5 * time.Second,
	}

	var lastErr error
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}

		resp, err := httpClient.Get(endpoint + "/minio/health/live")
		if err != nil {
			lastErr = err
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			return nil
		}
		lastErr = fmt.Errorf("health check returned %s", resp.Status)
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("timed out")
	}
	return lastErr
}