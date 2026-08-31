// Package s3store is a small, generic wrapper around an S3 bucket +
// prefix — upload, download, list, and batch-delete — with no knowledge
// of what's stored in it. nats_backup is its only caller today (see
// that package's runs.go for the "timestamped backup run" semantics
// built on top of this), but nothing here is NATS- or backup-specific;
// any future task that needs to read/write S3 (or a MinIO bucket) can
// use this directly instead of growing its own client.
//
// Built on AWS SDK for Go v2 (github.com/aws/aws-sdk-go-v2), not v1
// (github.com/aws/aws-sdk-go): v1 has been in maintenance mode since
// 2023 and AWS recommends v2 for new code. MinIO/custom-endpoint support
// uses s3.Options.BaseEndpoint + UsePathStyle (the current, supported
// per-request way to do this in v2) rather than the older
// EndpointResolver/EndpointResolverWithOptions mechanism, which the SDK
// deprecated in favor of exactly this.
//
// Upload/Download go straight through s3.Client's own PutObject/
// GetObject, not feature/s3/manager's Uploader/Downloader: AWS
// deprecated that package on 2026-01-30 in favor of
// feature/s3/transfermanager (see
// https://github.com/aws/aws-sdk-go-v2/discussions/3306), which was
// still at v0.x with open migration-compatibility issues as of this
// writing. Given the objects this package handles (one tar.gz per
// stream, produced by nats_backup) are nowhere near large enough to
// need multipart parallelism, plain PutObject/GetObject is both the
// simpler and the more stable choice — s3.Client accepts an
// io.ReadSeeker body directly and handles request signing itself,
// no separate uploader needed.
//
// Credentials are taken explicitly (Config.AccessKeyID/SecretAccessKey),
// not discovered ambiently from the environment at call time, even
// though the AWS SDK would happily do that itself. That's deliberate:
// system_manager is a single long-lived process shared with certrenewer,
// which temporarily — and, as of this writing, permanently — overwrites
// the process-wide AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY env vars with
// Route53's own credentials while talking to ACME/Route53 (see
// certrenewer/acme.go's setRoute53EnvVars). A client that re-read those
// env vars on every call would silently start authenticating as
// Route53's identity the first time certrenewer.Run fires, anywhere
// from minutes to days into the process's life depending on its
// schedule — exactly what happened before this comment was written.
// Capturing the real values once, before that collision can occur (see
// nats_backup.LoadConfig, called synchronously at startup before any
// task's Run has a chance to execute), sidesteps it entirely.
package s3store

import (
	"context"
	"fmt"
	"io"
	"os"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

// Config describes one bucket+prefix an s3store.Client talks to.
type Config struct {
	Bucket string
	// Prefix scopes every key this client builds or lists — may be "",
	// meaning the client operates at the bucket root. Leading/trailing
	// slashes are trimmed, so "nats/" and "nats" behave identically.
	Prefix string
	Region string

	// AccessKeyID/SecretAccessKey are passed explicitly rather than
	// left for the AWS SDK's default credential chain to discover from
	// the environment at call time. system_manager is one long-lived
	// process shared with certrenewer, which temporarily overwrites the
	// SAME AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY env vars — permanently,
	// via a bare os.Setenv with no restore — while it talks to Route53
	// (see certrenewer/acme.go's setRoute53EnvVars; go-acme/lego's
	// Route53 provider only knows how to read those exact names). Once
	// that's run even once, anything that re-reads those env vars later
	// in the process's life gets Route53's credentials instead of S3's.
	// Capturing the real values once, at nats_backup.LoadConfig() time
	// (main.go, before any task's Run has had a chance to execute),
	// and threading them through explicitly here sidesteps that
	// collision entirely rather than depending on call-order.
	AccessKeyID     string
	SecretAccessKey string

	// Endpoint/ForcePathStyle are for MinIO (or any S3-compatible
	// store) deployments — optional, mirroring wal-g's own
	// custom-endpoint support for the same use case. Endpoint == ""
	// means talk to real AWS S3.
	Endpoint       string
	ForcePathStyle bool
}

// Client is a bucket+prefix-scoped S3 client. Build one with New.
type Client struct {
	svc    *s3.Client
	bucket string
	prefix string // cfg.Prefix, trimmed of leading/trailing slashes
}

// New builds a Client from cfg. Credentials are passed explicitly
// (cfg.AccessKeyID/SecretAccessKey) rather than discovered from the
// environment at call time — see Config's doc comment for why that
// matters in this process specifically. Region still goes through
// awsconfig.WithRegion since nothing else in this process mutates that
// env var after startup.
func New(ctx context.Context, cfg Config) (*Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("loading AWS config: %w", err)
	}

	svc := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
			o.UsePathStyle = cfg.ForcePathStyle
		}
	})

	return &Client{
		svc:    svc,
		bucket: cfg.Bucket,
		prefix: strings.Trim(cfg.Prefix, "/"),
	}, nil
}

// Bucket returns the bucket this client is scoped to.
func (c *Client) Bucket() string { return c.bucket }

// Key builds a full object key from this client's prefix plus parts —
// for GET/PUT calls addressing one specific object.
func (c *Client) Key(parts ...string) string {
	return path.Join(append([]string{c.prefix}, parts...)...)
}

// GroupPrefix builds a full key PREFIX, ending in "/", from this
// client's prefix plus parts — for LIST/DELETE calls scoped to
// everything under it. The trailing slash matters: without it,
// ListObjectsV2's Prefix would also match any sibling key that happens
// to share this one as a literal string prefix (e.g. a run "2026"
// wrongly matching objects actually under "20260826T..."). Use this,
// not Key, whenever the result feeds Prefix in a list or delete
// operation.
func (c *Client) GroupPrefix(parts ...string) string {
	p := c.Key(parts...)
	if p != "" {
		p += "/"
	}
	return p
}

// UploadFile uploads the local file at localPath to key, via a plain
// PutObject — s3.Client accepts an io.ReadSeeker body directly (a
// *os.File satisfies that) and handles request signing itself, so no
// separate uploader is needed for objects this size. See the package
// doc comment for why this doesn't use feature/s3/manager.
func (c *Client) UploadFile(ctx context.Context, localPath, key string) error {
	f, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("opening %s: %w", localPath, err)
	}
	defer f.Close()

	_, err = c.svc.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
		Body:   f,
	})
	if err != nil {
		return fmt.Errorf("uploading %s to s3://%s/%s: %w", localPath, c.bucket, key, err)
	}
	return nil
}

// DownloadFile downloads key to the local file at localPath, via a
// plain GetObject. See UploadFile's doc comment for why this doesn't
// use feature/s3/manager.
func (c *Client) DownloadFile(ctx context.Context, key, localPath string) error {
	out, err := c.svc.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("downloading s3://%s/%s: %w", c.bucket, key, err)
	}
	defer out.Body.Close()

	f, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("creating %s: %w", localPath, err)
	}
	defer f.Close()

	if _, err := io.Copy(f, out.Body); err != nil {
		return fmt.Errorf("writing %s: %w", localPath, err)
	}
	return nil
}

// ListCommonPrefixes lists the "directories" one level below
// base (see GroupPrefix — base is relative to this client's own
// prefix; "" means directly below it), by name only, sorted by S3
// however it returns them (callers that need a particular order, e.g.
// chronological, sort the result themselves). S3's Delimiter="/" groups
// keys that way server-side, so this never has to enumerate every
// object inside every group just to find out which groups exist.
func (c *Client) ListCommonPrefixes(ctx context.Context, base string) ([]string, error) {
	full := c.GroupPrefix(base)

	var names []string
	paginator := s3.NewListObjectsV2Paginator(c.svc, &s3.ListObjectsV2Input{
		Bucket:    aws.String(c.bucket),
		Prefix:    aws.String(full),
		Delimiter: aws.String("/"),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listing s3://%s/%s: %w", c.bucket, full, err)
		}
		for _, cp := range page.CommonPrefixes {
			name := strings.TrimSuffix(strings.TrimPrefix(aws.ToString(cp.Prefix), full), "/")
			if name != "" {
				names = append(names, name)
			}
		}
	}
	return names, nil
}

// ListObjects returns every object key under subPrefix (relative to
// this client's own prefix; "" means every object this client can see).
func (c *Client) ListObjects(ctx context.Context, subPrefix string) ([]string, error) {
	full := c.GroupPrefix(subPrefix)

	var keys []string
	paginator := s3.NewListObjectsV2Paginator(c.svc, &s3.ListObjectsV2Input{
		Bucket: aws.String(c.bucket),
		Prefix: aws.String(full),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listing s3://%s/%s: %w", c.bucket, full, err)
		}
		for _, obj := range page.Contents {
			keys = append(keys, aws.ToString(obj.Key))
		}
	}
	return keys, nil
}

// DeleteObjects removes every given key (already full keys, as returned
// by ListObjects — not run through Key/GroupPrefix again), batching in
// groups of 1000, S3's own per-DeleteObjects-call limit.
//
// Uses withContentMD5 (below) on every call: since an SDK update, S3
// clients send a CRC32 trailing checksum by default instead of the
// classic Content-MD5 header for operations that require one —
// DeleteObjects among them. Real AWS S3 accepts either, but MinIO (and
// other S3-compatible stores whose DeleteObjects predates that change)
// only recognizes Content-MD5 and rejects the request with
// "MissingContentMD5" otherwise.
func (c *Client) DeleteObjects(ctx context.Context, keys []string) error {
	if len(keys) == 0 {
		return nil
	}

	const maxBatch = 1000
	for start := 0; start < len(keys); start += maxBatch {
		end := start + maxBatch
		if end > len(keys) {
			end = len(keys)
		}

		objects := make([]types.ObjectIdentifier, end-start)
		for i, k := range keys[start:end] {
			objects[i] = types.ObjectIdentifier{Key: aws.String(k)}
		}

		_, err := c.svc.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(c.bucket),
			Delete: &types.Delete{Objects: objects},
		}, withContentMD5)
		if err != nil {
			return fmt.Errorf("deleting %d object(s) from s3://%s: %w", len(objects), c.bucket, err)
		}
	}
	return nil
}

// withContentMD5 is an s3.Options functional option that restores the
// classic Content-MD5 checksum behavior for a single request, undoing
// the newer default of a CRC32 trailing checksum. DeleteObjectsInput has
// no ContentMD5 field of its own (unlike PutObjectInput) to ask for this
// the normal way — this is AWS's own documented workaround for exactly
// that gap: https://github.com/aws/aws-sdk-go-v2/discussions/2960
func withContentMD5(o *s3.Options) {
	o.APIOptions = append(o.APIOptions, func(stack *middleware.Stack) error {
		stack.Initialize.Remove("AWSChecksum:SetupInputContext")
		stack.Build.Remove("AWSChecksum:RequestMetricsTracking")
		stack.Finalize.Remove("AWSChecksum:ComputeInputPayloadChecksum")
		stack.Finalize.Remove("addInputChecksumTrailer")
		return smithyhttp.AddContentChecksumMiddleware(stack)
	})
}
