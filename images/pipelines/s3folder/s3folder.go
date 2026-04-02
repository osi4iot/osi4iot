package s3folder

import (
	"context"
	"fmt"
	"pipelines/common"
	"regexp"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ParquetFile represents a .parquet file found in S3.
type ParquetFile struct {
	Key        string
	OrgID      int64
	GroupID    int64
	AssetID    int64
	FolderName string
	Version    int
	Date       time.Time
	UnixTS     int64
	Size       int64
}

// parquetPattern validates and extracts groups from the full path.
// Example: org_1/group_2/asset_5/folder=telemetry/version=2/year=2024/month=03/day=15/1710504000.parquet
var parquetPattern = regexp.MustCompile(
	`^org_(\d+)/group_(\d+)/asset_(\d+)/folder=([^/]+)/version=(\d+)/year=(\d{4})/month=(\d{2})/day=(\d{2})/(\d+)\.parquet$`,
)

// ListParquetFiles returns all .parquet files that match
// the given parameters. If version == 0, it lists all versions.
func ListParquetFiles(
	ctx context.Context,
	client *s3.Client,
	bucket string,
	orgID, groupID, assetID int64,
	folderName string,
	version int,
) ([]ParquetFile, error) {

	prefix := buildPrefix(orgID, groupID, assetID, folderName, version)

	var files []ParquetFile
	paginator := s3.NewListObjectsV2Paginator(client, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listando objetos S3 (prefix=%q): %w", prefix, err)
		}

		for _, obj := range page.Contents {
			pf, err := parseParquetKey(aws.ToString(obj.Key))
			if err != nil {
				// Ignore keys that do not match the pattern
				continue
			}
			// Extra filter: if a specific version was requested, discard the rest
			// (useful when version==0 and the prefix does not include version).
			if version != 0 && pf.Version != version {
				continue
			}
			pf.Size = aws.ToInt64(obj.Size)
			files = append(files, pf)
		}
	}

	return files, nil
}

// buildPrefix builds the S3 search prefix.
// If version == 0, the prefix ends after folderName
// to retrieve all versions.
func buildPrefix(orgID, groupID, assetID int64, folderName string, version int) string {
	base := fmt.Sprintf(
		"org_%d/group_%d/asset_%d/folder=%s/",
		orgID, groupID, assetID, folderName,
	)
	if version == 0 {
		return base
	}
	return fmt.Sprintf("%sversion=%d/", base, version)
}

// parseParquetKey extracts all metadata from an S3 object path.
func parseParquetKey(key string) (ParquetFile, error) {
	m := parquetPattern.FindStringSubmatch(key)
	if m == nil {
		return ParquetFile{}, fmt.Errorf("clave no coincide con el patrón esperado: %q", key)
	}

	// m[0] = full match, m[1..9] = capture groups
	orgID, _ := strconv.ParseInt(m[1], 10, 64)
	groupID, _ := strconv.ParseInt(m[2], 10, 64)
	assetID, _ := strconv.ParseInt(m[3], 10, 64)
	version, _ := strconv.Atoi(m[5])
	year, _ := strconv.Atoi(m[6])
	month, _ := strconv.Atoi(m[7])
	day, _ := strconv.Atoi(m[8])
	unixTS, _ := strconv.ParseInt(m[9], 10, 64)

	date := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)

	return ParquetFile{
		Key:        key,
		OrgID:      orgID,
		GroupID:    groupID,
		AssetID:    assetID,
		FolderName: m[4],
		Version:    version,
		Date:       date,
		UnixTS:     unixTS,
	}, nil
}

// AggregateParquetFiles calls ListParquetFiles and aggregates the results.
func AggregateParquetFiles(
	ctx context.Context,
	client *s3.Client,
	bucket string,
	orgID, groupID, assetID int64,
	folderName string,
	version int,
) (common.S3FolderStats, error) {
	files, err := ListParquetFiles(ctx, client, bucket, orgID, groupID, assetID, folderName, version)
	if err != nil {
		return common.S3FolderStats{}, err
	}

	var result common.S3FolderStats
	for _, f := range files {
		result.ParquetFileCount++
		result.ParquetTotalBytes += f.Size

		// UnixTS from the file name is the real S3 write timestamp
		if ts := time.Unix(f.UnixTS, 0).UTC(); ts.After(result.LastS3Storage) {
			result.LastS3Storage = ts
		}
	}

	return result, nil
}

// SyncS3Stats queries S3, aggregates files, and updates the row in Postgres.
// It returns the active row after the update (it may be a new SCD2 version).
func SyncS3Stats(
	ctx context.Context,
	s3Client *s3.Client,
	bucket string,
	rowID int, // id of the active row in s3_folder
	orgID, groupID, assetID int64,
	folderName string,
	version int,
	parquetSchema []byte, // current schema jsonb
	updateAssetS3FolderStats func(ctx context.Context, groupId int, assetId int, folderName string, stats common.S3FolderStats) error,
) error {

	agg, err := AggregateParquetFiles(
		ctx, s3Client, bucket,
		orgID, groupID, assetID,
		folderName, version,
	)
	if err != nil {
		return fmt.Errorf("agregando archivos S3: %w", err)
	}

	// If there are no files yet, do not update to avoid overriding a valid zero
	if agg.ParquetFileCount == 0 {
		return nil
	}

	// Update stats in Postgres (SCD2 update that may create a new version).
	err = updateAssetS3FolderStats(ctx, int(groupID), int(assetID), folderName, agg)
	if err != nil {
		return fmt.Errorf("actualizando s3_folder (id=%d): %w", rowID, err)
	}

	return nil
}
