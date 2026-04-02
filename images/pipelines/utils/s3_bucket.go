package utils

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	localConfig "pipelines/config"
	"pipelines/logger"
)

func CreateS3Client(ctx context.Context, s3Config localConfig.AwsS3Config, log *logger.Logger) (*s3.Client, error) {
    cfg, err := config.LoadDefaultConfig(ctx,
        config.WithRegion(s3Config.Region),
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
