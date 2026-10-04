package docker

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// This file gives the CLI access to the platform's object store, which
// `osi4iot backup snapshot`, seeding a platform from one, and the bucket
// check after a deploy need.
//
// # Why not NATS
//
// Every other CLI-to-platform call in this package goes through
// system_manager over NATS. That works for catalogues and triggers and
// does not work for this: NATS's max_payload is 1 MB, while a wal-g base
// backup is gigabytes. NATS stays the control plane; the bytes come from
// the bucket.
//
// # Ways in, tried in order
//
// With "Cloud AWS S3" the bucket is on the internet and the CLI talks to
// it directly with the AWS SDK. Nothing else applies.
//
// With "Local Garage" there is normally no way in from the operator's
// machine: the service publishes no host port and has no Traefik route.
// So:
//
//   - In development mode the service DOES publish its S3 and admin
//     ports on the node, and the CLI connects to them with the AWS SDK.
//   - Otherwise a throwaway container runs the platform's own Garage
//     image — which carries rclone — on internal_net, and the objects
//     come out through rclone over the Docker exec API. See
//     garage_rclone_source.go.
//
// Either way the CLI signs with its own Garage key (utils.S3ConsumerCLI)
// for the platform's single region, utils.GarageS3Region. And either way
// the result is wrapped in garageStore, because with Garage the bucket
// is the provisioning's to create — see garageStore.EnsureBucket.

// objectSource is the read side of an object store, in the two terms
// the snapshot needs: what is there, and give me that one.
type objectSource interface {
	List(ctx context.Context, bucket, keyPrefix string) ([]s3Object, error)
	BucketExists(ctx context.Context, bucket string) (bool, error)
	Get(ctx context.Context, bucket, key string) (io.ReadCloser, error)
	Put(ctx context.Context, bucket, key string, size int64, body io.Reader) error
	EnsureBucket(ctx context.Context, bucket string) (created bool, err error)
	Empty(ctx context.Context, bucket string) (deleted int, err error)
	RemoveBucket(ctx context.Context, bucket string) error
	Close()
}

// s3Object is one stored object, as a listing reports it.
type s3Object struct {
	Key     string
	Size    int64
	ModTime time.Time
}

// PlatformS3 is a path to the platform's bucket. Always Close: for the
// rclone case that is what removes the helper container.
type PlatformS3 struct {
	source objectSource
	bucket string
}

// Bucket is the platform's bucket name.
func (p *PlatformS3) Bucket() string { return p.bucket }

// List returns everything stored under keyPrefix.
func (p *PlatformS3) List(ctx context.Context, bucket, keyPrefix string) ([]s3Object, error) {
	return p.source.List(ctx, bucket, keyPrefix)
}

// Get opens one object for reading. The caller closes it.
func (p *PlatformS3) Get(ctx context.Context, bucket, key string) (io.ReadCloser, error) {
	return p.source.Get(ctx, bucket, key)
}

// EnsureBucket creates the bucket if it is not there, and does nothing
// if it is.
//
// Needed because `init --snapshot-file` keeps admin_api out of the
// first deployment, and admin_api is what used to create the bucket.
// Doing it here also removes the dependency in the other direction: the
// seeding no longer needs another service to have run first.
// It reports whether it actually created the bucket, so a caller can
// say so: a step that is silent on success gives nobody a way to tell
// it ran at all.
func (p *PlatformS3) EnsureBucket(ctx context.Context, bucket string) (bool, error) {
	return p.source.EnsureBucket(ctx, bucket)
}

// Empty deletes every object in the bucket, leaving the bucket itself.
// Returns how many went.
func (p *PlatformS3) Empty(ctx context.Context, bucket string) (int, error) {
	return p.source.Empty(ctx, bucket)
}

// RemoveBucket deletes the bucket, which must already be empty.
func (p *PlatformS3) RemoveBucket(ctx context.Context, bucket string) error {
	return p.source.RemoveBucket(ctx, bucket)
}

// Put stores one object. size is the exact byte count of body.
//
// The write half exists for seeding a new platform's bucket from a
// snapshot; nothing in the CLI writes to the object store otherwise,
// and nothing here ever deletes.
func (p *PlatformS3) Put(ctx context.Context, bucket, key string, size int64, body io.Reader) error {
	return p.source.Put(ctx, bucket, key, size, body)
}

// Close tears down whatever had to be stood up. Safe to call twice, and
// worth calling as early as the work allows.
func (p *PlatformS3) Close() {
	if p == nil || p.source == nil {
		return
	}
	p.source.Close()
	p.source = nil
}

// OpenPlatformS3 builds a path to the platform's object store.
//
// garageImage may be empty, in which case the Garage image this platform
// runs is used for the rclone helper. It is ignored for AWS.
func OpenPlatformS3(
	ctx context.Context,
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	garageImage string,
	logger *log.Logger,
) (*PlatformS3, error) {
	pi := pd.PlatformInfo

	if pi.S3BucketName == "" {
		return nil, fmt.Errorf("this platform has no S3 bucket configured")
	}
	if err := utils.CheckS3BucketType(pi); err != nil {
		return nil, err
	}

	if utils.IsAwsS3(pi) {
		return openAwsSource(ctx, pi, logger)
	}

	// Garage, with the CLI's own key.
	creds := utils.S3CredentialsFor(pi, utils.S3ConsumerCLI)
	if creds.AccessKeyID == "" || creds.SecretAccessKey == "" {
		return nil, fmt.Errorf("the state file has no Garage S3 key for the CLI; " +
			"redeploy the platform (osi4iot run) so it is generated and provisioned")
	}

	// A platform in development mode publishes Garage's ports on the
	// node, and then there is nothing to stand up. Worth trying first —
	// it needs no container and no image.
	if endpoint := publishedGarageEndpoint(ctx, pd, dc, logger); endpoint != "" {
		if logger != nil {
			logger.Printf("Garage is published at %s; connecting to it directly.", endpoint)
		}
		cli, err := awsS3Client(ctx, creds.AccessKeyID, creds.SecretAccessKey,
			utils.GarageS3Region, endpoint, nil)
		if err != nil {
			return nil, err
		}
		return &PlatformS3{source: &garageStore{objectSource: &awsSource{cli: cli}},
			bucket: pi.S3BucketName}, nil
	}

	source, err := startRcloneSource(ctx, pd, dc, garageImage, creds, logger)
	if err != nil {
		return nil, err
	}
	return &PlatformS3{source: &garageStore{objectSource: source}, bucket: pi.S3BucketName}, nil
}

// garageStore is an objectSource on the platform's Garage.
//
// It differs from the plain source in what it does NOT do. The bucket,
// the keys and their permissions belong to the garage service's
// provisioning (garage-provision, run on every start of the service):
// a bucket created here through S3 would carry the CLI key's permissions
// only, and every other service would be refused. None of the platform's
// keys may create or delete buckets in the first place.
type garageStore struct {
	objectSource
}

// garageBucketWait bounds how long EnsureBucket waits for the
// provisioning. The service turns healthy once its layout is applied,
// which is a step BEFORE the bucket is created, so a deploy that has
// just seen it healthy can arrive a few seconds early.
const garageBucketWait = 2 * time.Minute

// EnsureBucket waits for the provisioning to have created the bucket.
// It never creates one itself, so it never reports created=true.
func (g *garageStore) EnsureBucket(ctx context.Context, bucket string) (bool, error) {
	deadline := time.Now().Add(garageBucketWait)
	for {
		exists, err := g.BucketExists(ctx, bucket)
		if err == nil && exists {
			return false, nil
		}
		if time.Now().After(deadline) {
			if err != nil {
				return false, fmt.Errorf("error checking the bucket '%s' in Garage: %w", bucket, err)
			}
			return false, fmt.Errorf("the bucket '%s' does not exist in Garage, or the CLI's key "+
				"has no access to it. Garage creates it at start-up: see "+
				"'docker service logs %s' for the provisioning's output", bucket, utils.GarageServiceName)
		}
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
}

// RemoveBucket is refused: see errGarageBucketManaged.
func (g *garageStore) RemoveBucket(ctx context.Context, bucket string) error {
	return errGarageBucketManaged(bucket)
}

// ── The AWS SDK source ───────────────────────────────────────────────

// openAwsSource builds the read path to a real S3 bucket.
//
// The credentials and the region are the ones wal-g already uses, so a
// bucket the platform can write is a bucket this can read — with one
// exception worth catching early rather than late: the region recorded
// in the state file is whatever the operator typed into the form, and
// S3 answers a request aimed at the wrong region with a redirect that
// the SDK does not follow. Left alone that surfaces as an opaque error
// on the first listing, after the WAL has already been flushed.
func openAwsSource(ctx context.Context, pi pt.PlatformInfo, logger *log.Logger) (*PlatformS3, error) {
	if pi.AWSAccessKeyIDS3Bucket == "" || pi.AWSSecretAccessKeyS3Bucket == "" {
		return nil, fmt.Errorf("this platform stores its backups in an AWS S3 bucket, but the " +
			"state file has no AWS credentials for it")
	}

	region := utils.S3Region(pi)
	cli, err := awsS3Client(ctx, pi.AWSAccessKeyIDS3Bucket, pi.AWSSecretAccessKeyS3Bucket,
		region, "", nil)
	if err != nil {
		return nil, err
	}

	actual, exists, err := bucketRegion(ctx, cli, pi.S3BucketName)
	if err != nil {
		return nil, err
	}
	if !exists {
		// Not an error here. The bucket is created by EnsureBucket when
		// a platform is seeded, and on an ordinary read path a missing
		// bucket surfaces on the first listing with S3's own wording.
		// The configured region is the one to create it in.
		if logger != nil {
			logger.Printf("The bucket '%s' does not exist yet in %s.",
				pi.S3BucketName, displayRegion(region))
		}
		return &PlatformS3{source: &awsSource{cli: cli}, bucket: pi.S3BucketName}, nil
	}
	if actual != "" && actual != region {
		if logger != nil {
			logger.Printf("The bucket '%s' is in %s, not in %s as the state file says; using %s.",
				pi.S3BucketName, actual, displayRegion(region), actual)
		}
		cli, err = awsS3Client(ctx, pi.AWSAccessKeyIDS3Bucket, pi.AWSSecretAccessKeyS3Bucket,
			actual, "", nil)
		if err != nil {
			return nil, err
		}
	}

	return &PlatformS3{source: &awsSource{cli: cli}, bucket: pi.S3BucketName}, nil
}

// bucketRegion returns the bucket's real region when it differs from
// the client's, "" when the client is already right, and an error when
// the bucket cannot be reached at all.
func bucketRegion(ctx context.Context, cli *s3.Client, bucket string) (region string, exists bool, err error) {
	_, err = cli.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(bucket)})
	if err == nil {
		return "", true, nil
	}

	var respErr *awshttp.ResponseError
	if errors.As(err, &respErr) {
		// S3 answers a request aimed at the wrong region with a
		// redirect the SDK does not follow, and names the right region
		// in this header. It is the only way to learn it without
		// s3:GetBucketLocation, a permission the platform's key has no
		// reason to hold.
		if respErr.Response != nil {
			if actual := respErr.Response.Header.Get("x-amz-bucket-region"); actual != "" {
				return actual, true, nil
			}
		}
		switch respErr.HTTPStatusCode() {
		case http.StatusNotFound:
			return "", false, nil
		case http.StatusForbidden:
			return "", false, fmt.Errorf("these AWS credentials cannot read the bucket '%s'.\n%s",
				bucket, s3PermissionsHint(bucket))
		}
	}

	return "", false, fmt.Errorf("error reaching the bucket '%s': %w", bucket, err)
}

// displayRegion names an empty region for an error message, since an
// empty one means the SDK default rather than none at all.
func displayRegion(region string) string {
	if region == "" {
		return "us-east-1 (no region in the state file)"
	}
	return region
}

// awsSource reads through the S3 API, whether that is real S3 or a
// Garage the CLI can reach on a published port.
type awsSource struct {
	cli *s3.Client
}

func (a *awsSource) Close() {}

// s3PermissionsHint says what a read path needs, and where the
// credentials being refused came from.
//
// Worth spelling out because the two callers get their credentials from
// completely different places — the state file for a running platform,
// the SDK's chain for `init --from-bucket` — and an operator staring at
// an AccessDenied has no way to tell which identity was refused. On EC2
// the chain quietly resolves to the instance role, which is rarely the
// one anybody was thinking of.
func s3PermissionsHint(bucket string) string {
	return fmt.Sprintf(
		"Reading needs s3:ListBucket on arn:aws:s3:::%s and s3:GetObject on "+
			"arn:aws:s3:::%s/*\n"+
			"If the identity being refused is not the one you meant — on EC2 the SDK falls back "+
			"to the instance role — set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, which take "+
			"priority over it", bucket, bucket)
}

func (a *awsSource) List(ctx context.Context, bucket, keyPrefix string) ([]s3Object, error) {
	var objects []s3Object

	paginator := s3.NewListObjectsV2Paginator(a.cli, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(keyPrefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			// The permissions hint is attached HERE rather than only at
			// HeadBucket, because HeadBucket can succeed against a
			// bucket the caller cannot list: AWS answers it with the
			// x-amz-bucket-region header even on a 403, so the region
			// check passes and the refusal only surfaces on the first
			// real listing.
			var respErr *awshttp.ResponseError
			if errors.As(err, &respErr) && respErr.HTTPStatusCode() == http.StatusForbidden {
				return nil, fmt.Errorf("not allowed to list s3://%s/%s\n%s",
					bucket, keyPrefix, s3PermissionsHint(bucket))
			}
			return nil, fmt.Errorf("error listing s3://%s/%s: %w", bucket, keyPrefix, err)
		}
		for _, item := range page.Contents {
			if item.Key == nil || strings.HasSuffix(*item.Key, "/") {
				continue
			}
			object := s3Object{Key: *item.Key}
			if item.Size != nil {
				object.Size = *item.Size
			}
			if item.LastModified != nil {
				object.ModTime = item.LastModified.UTC()
			}
			objects = append(objects, object)
		}
	}

	return objects, nil
}

// BucketExists reports whether HeadBucket finds the bucket. A 404 is
// "no"; any other failure is an error.
func (a *awsSource) BucketExists(ctx context.Context, bucket string) (bool, error) {
	_, err := a.cli.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(bucket)})
	if err == nil {
		return true, nil
	}
	var respErr *awshttp.ResponseError
	if errors.As(err, &respErr) && respErr.HTTPStatusCode() == http.StatusNotFound {
		return false, nil
	}
	return false, err
}

func (a *awsSource) EnsureBucket(ctx context.Context, bucket string) (bool, error) {
	if _, err := a.cli.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(bucket)}); err == nil {
		return false, nil
	}

	input := &s3.CreateBucketInput{Bucket: aws.String(bucket)}

	// Every region except us-east-1 REQUIRES a location constraint, and
	// us-east-1 must not have one. Without it S3 assumes us-east-1 and
	// the regional endpoint the request was actually sent to refuses it
	// with IllegalLocationConstraintException.
	//
	// The region is read back from the client rather than passed in,
	// because by this point it may not be the one the caller asked for:
	// openAwsSource rebuilds the client when the bucket turns out to
	// live somewhere else, and this has to agree with the endpoint the
	// request will leave through.
	if region := a.cli.Options().Region; region != "" && region != "us-east-1" {
		input.CreateBucketConfiguration = &s3types.CreateBucketConfiguration{
			LocationConstraint: s3types.BucketLocationConstraint(region),
		}
	}

	// Not checked for a 404 first: CreateBucket on a bucket that is
	// already there returns BucketAlreadyOwnedByYou on every region but
	// us-east-1, where it is a plain success, and both mean the same
	// thing here. A real permission problem surfaces as something else.
	_, err := a.cli.CreateBucket(ctx, input)
	if err != nil {
		var owned *s3types.BucketAlreadyOwnedByYou
		var exists *s3types.BucketAlreadyExists
		if errors.As(err, &owned) {
			return false, nil
		}
		if errors.As(err, &exists) {
			return false, fmt.Errorf("the bucket '%s' exists but belongs to someone else", bucket)
		}
		return false, fmt.Errorf("error creating the bucket '%s': %w", bucket, err)
	}
	return true, nil
}

func (a *awsSource) Empty(ctx context.Context, bucket string) (int, error) {
	objects, err := a.List(ctx, bucket, "")
	if err != nil {
		return 0, err
	}

	// One object at a time rather than DeleteObjects. The batch call is
	// far faster, and also the one whose checksum requirements differ
	// between S3 implementations and SDK versions, so the version that
	// works everywhere is the boring one. This runs on a bucket someone
	// has asked to destroy, where correctness matters more than speed.
	deleted := 0
	for _, object := range objects {
		_, err := a.cli.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(object.Key),
		})
		if err != nil {
			return deleted, fmt.Errorf("error deleting s3://%s/%s after %d object(s): %w",
				bucket, object.Key, deleted, err)
		}
		deleted++
	}
	return deleted, nil
}

func (a *awsSource) RemoveBucket(ctx context.Context, bucket string) error {
	if _, err := a.cli.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: aws.String(bucket)}); err != nil {
		return fmt.Errorf("error deleting the bucket '%s': %w", bucket, err)
	}
	return nil
}

func (a *awsSource) Put(ctx context.Context, bucket, key string, size int64, body io.Reader) error {
	_, err := a.cli.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentLength: aws.Int64(size),
	})
	if err != nil {
		return fmt.Errorf("error uploading s3://%s/%s: %w", bucket, key, err)
	}
	return nil
}

func (a *awsSource) Get(ctx context.Context, bucket, key string) (io.ReadCloser, error) {
	out, err := a.cli.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("error downloading s3://%s/%s: %w", bucket, key, err)
	}
	return out.Body, nil
}

// looksLikeRegionCode reports whether a string could be a region code:
// lowercase letters, digits and hyphens, and no spaces or brackets.
func looksLikeRegionCode(region string) bool {
	if region == "" {
		return false
	}
	for _, r := range region {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-':
		default:
			return false
		}
	}
	return true
}

// awsS3Client assembles the client. endpoint empty means real AWS;
// anything else is Garage and gets path-style addressing, because Garage
// on a bare address has no virtual-host addressing.
func awsS3Client(ctx context.Context, keyID, secret, region, endpoint string, httpClient *http.Client) (*s3.Client, error) {
	region = utils.AwsRegionCode(region)

	// A region the SDK would reject outright is worse than no region at
	// all: with none, bucketRegion learns the real one from S3's own
	// x-amz-bucket-region header and rebuilds the client. With a bad
	// one, every call fails before it leaves the process.
	if region != "" && !looksLikeRegionCode(region) {
		region = ""
	}
	if region == "" {
		region = "us-east-1"
	}

	options := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(region)}
	if keyID != "" || secret != "" {
		options = append(options, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(keyID, secret, ""),
		))
	}
	// No credentials given means fall through to the SDK's own chain:
	// environment, shared profile, instance role. That is the only way
	// in for `init --from-bucket`, which has to read the bucket BEFORE
	// it has a state file to take credentials from.

	cfg, err := awsconfig.LoadDefaultConfig(ctx, options...)
	if err != nil {
		return nil, fmt.Errorf("error building the S3 client: %w", err)
	}

	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		}
		if httpClient != nil {
			o.HTTPClient = httpClient
		}

		// The SDK defaults to validating a CRC on every response and
		// logging a warning when there is none to validate. Objects
		// written by wal-g and by system_manager carry no
		// x-amz-checksum-* header, so that warning fires once per
		// object and says nothing: a snapshot of a WAL directory would
		// bury its own progress under thousands of lines.
		//
		// Nothing is given up by turning it off here. Every byte that
		// goes into a bundle is hashed with SHA-256 on the way in and
		// recorded in the manifest, the writer refuses an object whose
		// length does not match what the listing reported, and the
		// reader verifies the hash again on the way out. The integrity
		// guarantee is ours end to end, not the transport's.
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired

		// The matching setting for uploads. Left on the default, the
		// SDK adds a trailing CRC and switches the body to aws-chunked
		// encoding, which is a needless second framing over a body the
		// snapshot has already verified by SHA-256 on the way out of
		// the archive. Off, PutObject sends the bytes as they are.
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
	}), nil
}

// publishedGarageEndpoint returns a URL for Garage's S3 API if the
// platform publishes it on a node, or "" if it does not.
//
// services.GarageService publishes the S3 and admin ports in host mode
// only in development mode and only for a single-instance Garage, so on
// any other platform this finds nothing and the rclone helper takes over. The ports are read from the
// service rather than assumed, because published and target ports need
// not match. A node counts once Garage's /health answers 200 on it.
func publishedGarageEndpoint(ctx context.Context, pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) string {
	if dc == nil || dc.Cli == nil {
		return ""
	}

	f := filters.NewArgs()
	f.Add("name", utils.GarageServiceName+"_")
	services, err := dc.Cli.ServiceList(ctx, types.ServiceListOptions{Filters: f})
	if err != nil {
		return ""
	}

	s3Port, adminPort := uint32(0), uint32(0)
	for _, service := range services {
		if _, isInstance := utils.GarageInstanceIDFromService(service.Spec.Name); !isInstance {
			continue
		}
		for _, port := range service.Endpoint.Ports {
			switch {
			case port.TargetPort == utils.GarageS3Port && port.PublishedPort != 0:
				s3Port = port.PublishedPort
			case port.TargetPort == utils.GarageAdminPort && port.PublishedPort != 0:
				adminPort = port.PublishedPort
			}
		}
	}
	if s3Port == 0 || adminPort == 0 {
		return ""
	}

	httpClient := &http.Client{Timeout: 3 * time.Second}
	for _, node := range pd.PlatformInfo.NodesData {
		if node.NodeIP == "" {
			continue
		}
		resp, err := httpClient.Get(fmt.Sprintf("http://%s:%d/health", node.NodeIP, adminPort))
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			return fmt.Sprintf("http://%s:%d", node.NodeIP, s3Port)
		}
	}

	if logger != nil {
		logger.Printf("Garage publishes port %d, but no node answered on it.", s3Port)
	}
	return ""
}

// ── Helper container bookkeeping ─────────────────────────────────────

// openHelpers tracks every helper container this process has started,
// so CleanResources can remove them when the operator interrupts the
// command.
//
// A deferred Close does not run on SIGINT, and main.go's handler is the
// one place that already runs on every exit path. Leaving the container
// behind is not catastrophic — it holds no data and serves nothing —
// but it is a stray container on a platform node with a name that will
// collide with the next run.
//
// Wire it up with one line in CleanResources (swarm.go):
//
//	CloseS3Helpers()
var (
	openHelpers   []*rcloneSource
	openHelpersMu sync.Mutex
)

// CloseS3Helpers removes any object-store helper container left running
// by this process. Safe to call when there are none.
func CloseS3Helpers() {
	openHelpersMu.Lock()
	helpers := openHelpers
	openHelpers = nil
	openHelpersMu.Unlock()

	for _, helper := range helpers {
		helper.Close()
	}
}

func rememberHelper(m *rcloneSource) {
	openHelpersMu.Lock()
	openHelpers = append(openHelpers, m)
	openHelpersMu.Unlock()
}

func forgetHelper(m *rcloneSource) {
	openHelpersMu.Lock()
	for i, candidate := range openHelpers {
		if candidate == m {
			openHelpers = append(openHelpers[:i], openHelpers[i+1:]...)
			break
		}
	}
	openHelpersMu.Unlock()
}

// ParseS3Prefix splits an "s3://bucket/some/prefix" value — the shape
// WALG_S3_PREFIX_*, NATS_BACKUP_S3_PREFIX and STATE_FILE_S3_PREFIX all
// use — into its bucket and its key prefix.
//
// The key prefix comes back without leading or trailing slashes, so
// callers can join it with path elements without thinking about it.
func ParseS3Prefix(value string) (bucket string, keyPrefix string, err error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", "", fmt.Errorf("empty S3 prefix")
	}
	if !strings.HasPrefix(trimmed, "s3://") {
		return "", "", fmt.Errorf("%q is not an s3:// URL", value)
	}

	rest := strings.TrimPrefix(trimmed, "s3://")
	parts := strings.SplitN(rest, "/", 2)
	bucket = parts[0]
	if bucket == "" {
		return "", "", fmt.Errorf("%q has no bucket in it", value)
	}
	if len(parts) == 2 {
		keyPrefix = strings.Trim(parts[1], "/")
	}
	return bucket, keyPrefix, nil
}
