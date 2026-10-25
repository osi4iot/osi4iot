package utils

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	localConfig "pipelines/config"
	"pipelines/logger"
)

// defaultS3Region applies when the configuration has no region: it is
// the platform Garage's s3_region and AWS's default. The SDK would
// otherwise fail with "invalid region", and Garage rejects requests
// signed for any other region.
const defaultS3Region = "us-east-1"

// CreateS3Client builds the client for the platform's object store. A
// non-empty Endpoint means Garage (http://garage:3900): path-style
// addressing, since it is reached by service name.
func CreateS3Client(ctx context.Context, s3Config localConfig.AwsS3Config, log *logger.Logger) (*s3.Client, error) {
    region := strings.TrimSpace(s3Config.Region)
    if region == "" {
        region = defaultS3Region
    }
    cfg, err := config.LoadDefaultConfig(ctx,
        config.WithRegion(region),
        config.WithCredentialsProvider(
            credentials.NewStaticCredentialsProvider(
                s3Config.AccessKeyId,
                s3Config.SecretAccessKey,
                "",
            ),
        ),
    )
    if err != nil {
        return nil, fmt.Errorf("error loading AWS config: %w", err)
    }

    client := s3.NewFromConfig(cfg, func(o *s3.Options) {
        if s3Config.Endpoint != "" {
            o.BaseEndpoint = aws.String(s3Config.Endpoint)
            o.UsePathStyle = true
            // Garage returns the COMPOSITE checksum of a multipart
            // upload (CRC32 of the parts' CRC32s) without AWS's "-N"
            // suffix, so the SDK takes it for a full-object checksum
            // and fails every download of such an object with a
            // checksum mismatch, although the bytes are right.
            // Validate and send checksums only where the API requires.
            o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
            o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
        }
    })

    log.Info("AWS S3 client created successfully")
    return client, nil
}

func UploadFileToS3(s3Client *s3.Client, bucketName, filePath, s3Key string, log *logger.Logger) error {
	// Read the temporary file
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("error opening temp file: %w", err)
	}
	defer file.Close()

	// Upload the file to S3
	_, err = s3Client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(s3Key),
		Body:   file,
	})
	if err != nil {
		return fmt.Errorf("error uploading to S3: %w", err)
	}

	log.Info(fmt.Sprintf("File uploaded to S3: %s", s3Key))
	return nil
}

// GetS3Object returns a (small) object's bytes. found is false when the
// object does not exist.
func GetS3Object(ctx context.Context, c *s3.Client, bucket, key string) (data []byte, found bool, err error) {
	out, err := c.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		var noKey *types.NoSuchKey
		var notFound *types.NotFound
		if errors.As(err, &noKey) || errors.As(err, &notFound) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("error getting s3://%s/%s: %w", bucket, key, err)
	}
	defer out.Body.Close()
	// Sized from Content-Length: io.ReadAll would grow the slice by
	// doubling, up to about twice a large object's size.
	if n := aws.ToInt64(out.ContentLength); n > 0 {
		data = make([]byte, n)
		_, err = io.ReadFull(out.Body, data)
	} else {
		data, err = io.ReadAll(out.Body)
	}
	if err != nil {
		return nil, false, fmt.Errorf("error reading s3://%s/%s: %w", bucket, key, err)
	}
	return data, true, nil
}

// S3ObjectVersion identifies an object's current content: its ETag and
// last modification. "" when the object does not exist.
func S3ObjectVersion(ctx context.Context, c *s3.Client, bucket, key string) (string, error) {
	out, err := c.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		var noKey *types.NoSuchKey
		var notFound *types.NotFound
		if errors.As(err, &noKey) || errors.As(err, &notFound) {
			return "", nil
		}
		return "", fmt.Errorf("error checking s3://%s/%s: %w", bucket, key, err)
	}
	version := aws.ToString(out.ETag)
	if out.LastModified != nil {
		version += "@" + out.LastModified.UTC().Format(time.RFC3339Nano)
	}
	if version == "" {
		version = "present"
	}
	return version, nil
}

// UploadFileToS3WithContext uploads a local file.
func UploadFileToS3WithContext(ctx context.Context, c *s3.Client, bucket, filePath, key string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("error opening %s: %w", filePath, err)
	}
	defer file.Close()
	if _, err := c.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   file,
	}); err != nil {
		return fmt.Errorf("error uploading s3://%s/%s: %w", bucket, key, err)
	}
	return nil
}

// DeleteS3Prefix deletes every object under prefix, one DeleteObject at
// a time: these prefixes hold a handful of objects, and DeleteObjects
// needs a request checksum Garage handles differently from AWS.
func DeleteS3Prefix(ctx context.Context, c *s3.Client, bucket, prefix string) error {
	paginator := s3.NewListObjectsV2Paginator(c, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return fmt.Errorf("error listing s3://%s/%s: %w", bucket, prefix, err)
		}
		for _, obj := range page.Contents {
			if _, err := c.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket: aws.String(bucket),
				Key:    obj.Key,
			}); err != nil {
				return fmt.Errorf("error deleting s3://%s/%s: %w", bucket, aws.ToString(obj.Key), err)
			}
		}
	}
	return nil
}

// NewestS3Object returns the key of the most recently modified object
// under prefix, or "" when there is none.
func NewestS3Object(ctx context.Context, c *s3.Client, bucket, prefix string) (string, error) {
	var newest types.Object
	paginator := s3.NewListObjectsV2Paginator(c, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return "", fmt.Errorf("error listing s3://%s/%s: %w", bucket, prefix, err)
		}
		for _, obj := range page.Contents {
			if newest.Key == nil || aws.ToTime(obj.LastModified).After(aws.ToTime(newest.LastModified)) {
				newest = obj
			}
		}
	}
	return aws.ToString(newest.Key), nil
}
