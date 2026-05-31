package utils

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials/ec2rolecreds"
)

var AwsRegions = []string{
	"US East (Ohio)",
	"US East (N. Virginia)",
	"US West (N. California)",
	"US West (Oregon)",
	"Africa (Cape Town)",
	"Asia Pacific (Hong Kong)",
	"Asia Pacific (Hyderabad)",
	"Asia Pacific (Jakarta)",
	"Asia Pacific (Malaysia)",
	"Asia Pacific (Melbourne)",
	"Asia Pacific (Mumbai)",
	"Asia Pacific (Osaka)",
	"Asia Pacific (Seoul)",
	"Asia Pacific (Singapore)",
	"Asia Pacific (Sydney)",
	"Asia Pacific (Thailand)",
	"Asia Pacific (Tokyo)",
	"Canada (Central)",
	"Canada West (Calgary)",
	"Europe (Frankfurt)",
	"Europe (Ireland)",
	"Europe (London)",
	"Europe (Milan)",
	"Europe (Paris)",
	"Europe (Spain)",
	"Europe (Stockholm)",
	"Europe (Zurich)",
	"Israel (Tel Aviv)",
	"Middle East (Bahrain)",
	"Middle East (UAE)",
	"South America (São Paulo)",
}

var AwsRegionsMap = map[string]string{
	"US East (Ohio)":            "us-east-2",
	"US East (N. Virginia)":     "us-east-1",
	"US West (N. California)":   "us-west-1",
	"US West (Oregon)":          "us-west-2",
	"Africa (Cape Town)":        "af-south-1",
	"Asia Pacific (Hong Kong)":  "ap-east-1",
	"Asia Pacific (Hyderabad)":  "ap-south-2",
	"Asia Pacific (Jakarta)":    "ap-southeast-3",
	"Asia Pacific (Malaysia)":   "ap-southeast-5",
	"Asia Pacific (Melbourne)":  "ap-southeast-4",
	"Asia Pacific (Mumbai)":     "ap-south-1",
	"Asia Pacific (Osaka)":      "ap-northeast-3",
	"Asia Pacific (Seoul)":      "ap-northeast-2",
	"Asia Pacific (Singapore)":  "ap-southeast-1",
	"Asia Pacific (Sydney)":     "ap-southeast-2",
	"Asia Pacific (Thailand)":   "ap-southeast-7",
	"Asia Pacific (Tokyo)":      "ap-northeast-1",
	"Canada (Central)":          "ca-central-1",
	"Canada West (Calgary)":     "ca-west-1",
	"Europe (Frankfurt)":        "eu-central-1",
	"Europe (Ireland)":          "eu-west-1",
	"Europe (London)":           "eu-west-2",
	"Europe (Milan)":            "eu-south-1",
	"Europe (Paris)":            "eu-west-3",
	"Europe (Spain)":            "eu-south-2",
	"Europe (Stockholm)":        "eu-north-1",
	"Europe (Zurich)":           "eu-central-2",
	"Israel (Tel Aviv)":         "il-central-1",
	"Middle East (Bahrain)":     "me-south-1",
	"Middle East (UAE)":         "me-central-1",
	"South America (São Paulo)": "sa-east-1",
}

const imdsBaseURL = "http://169.254.169.254"

func IsEC2Instance() (bool, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    defer cancel()

	// Try to get a token for IMDSv2.
    token, err := getIMDSv2Token(ctx)
    if err == nil {
        return verifyWithToken(ctx, token)
    }

    // Fallback to IMDSv1 if IMDSv2 token retrieval fails
    return verifyIMDSv1(ctx)
}

func getIMDSv2Token(ctx context.Context) (string, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodPut,
        imdsBaseURL+"/latest/api/token", nil)
    if err != nil {
        return "", err
    }
    req.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", "21600")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return "", fmt.Errorf("unexpected status: %d", resp.StatusCode)
    }

    tokenBytes, err := io.ReadAll(resp.Body)
    if err != nil {
        return "", err
    }
    return string(tokenBytes), nil
}

func verifyWithToken(ctx context.Context, token string) (bool, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet,
        imdsBaseURL+"/latest/meta-data/instance-id", nil)
    if err != nil {
        return false, err
    }
    req.Header.Set("X-aws-ec2-metadata-token", token)

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return false, nil // timeout or no network → not EC2
    }
    defer resp.Body.Close()

    return resp.StatusCode == http.StatusOK, nil
}

func verifyIMDSv1(ctx context.Context) (bool, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet,
        imdsBaseURL+"/latest/meta-data/instance-id", nil)
    if err != nil {
        return false, err
    }

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return false, nil // timeout or no network → not EC2
    }
    defer resp.Body.Close()

    return resp.StatusCode == http.StatusOK, nil
}

func GetEC2RoleConfig(ctx context.Context) (aws.Config, error) {
	// Obtain the region from the EC2 IMDS
    cfg, err := config.LoadDefaultConfig(ctx,
        config.WithCredentialsProvider(
            aws.NewCredentialsCache(
                ec2rolecreds.New(),
            ),
        ),
		// Load the region from IMDS automatically
        config.WithEC2IMDSRegion(),
    )
    if err != nil {
        return aws.Config{}, fmt.Errorf("error loading AWS config: %w", err)
    }
    return cfg, nil
}

