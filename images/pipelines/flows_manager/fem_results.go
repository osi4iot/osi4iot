package flows_manager

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"pipelines/common"
	"pipelines/config"
	"pipelines/utils"
)

// FEM results
//
// The FEM results of the 3D model of a slide of a digital twin's Viewer
// arrive as one JSON file in the slide's S3 folder femResJson (each
// slide has its own model and results: admin_api slideModels.ts). The AI agents query them through the fem_results MCP
// server, which reads Parquet with DuckDB. The JSON is turned into Parquet
// ONCE, when the admin API announces a new file (femResults "create"),
// and the Parquet files go to the bucket, next to it:
//
//	org_data/org_<org>/group_<group>/digitalTwin_<dt>/slides/<slideId>/
//	    femResJson/<file>.json
//	    femResParquet/mesh_<n>.parquet, femres_On*_mesh_<n>.parquet, metadata.json
//
// (a slide "" is the root of the digital twin's folder, where they were
// before slides had models; admin_api moves them to the slides at start)
//
// (admin_api deletes the whole digitalTwin_<dt> folder with the digital
// twin, and moves the folders of older versions at startup: femResFiles
// to femResJson, and the root femResParquet/ is deleted to be converted
// again here.)
//
// where the MCP server reads them directly. Nothing is kept on the
// pipelines' disk, so pipelines stays stateless.
//
// metadata.json is uploaded last and records the JSON's name and date:
// its presence means the set is complete, and comparing it with the JSON
// tells whether the set is current.
//
// Every replica receives the admin message; one does the work. The
// others find the set current in the bucket, or the lock in the leader
// KV store taken, and skip it.

// The digital twin's folders of FEM results (see above).
const (
	femResultsJSONFolder    = "femResJson"
	femResultsParquetFolder = "femResParquet"
)

// Environment of the MCP servers the AI agents start (fem_results,
// doc_info): they inherit it from pipelines, so the bucket credentials
// need not be put on a command line.
const (
	mcpS3BucketEnv    = "MCP_S3_BUCKET"
	mcpS3RegionEnv    = "MCP_S3_REGION"
	mcpS3AccessKeyEnv = "MCP_S3_ACCESS_KEY_ID"
	mcpS3SecretEnv    = "MCP_S3_SECRET_ACCESS_KEY"
	mcpS3EndpointEnv  = "MCP_S3_ENDPOINT"
)

func femResultsParquetPrefix(orgId, groupId, digitalTwinId int, slideId string) string {
	base := fmt.Sprintf("org_data/org_%d/group_%d/digitalTwin_%d", orgId, groupId, digitalTwinId)
	if slideId != "" {
		base += "/slides/" + slideId
	}
	return base + "/" + femResultsParquetFolder
}

// slideIdOf is the slide of an admin message's context ("" none).
func slideIdOf(context map[string]any) string {
	slideId, _ := context["slideId"].(string)
	return slideId
}

// exportMcpS3Env makes the bucket settings available to the agents' MCP
// servers (child processes).
func exportMcpS3Env(cfg config.AwsS3Config) {
	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		region = "us-east-1"
	}
	os.Setenv(mcpS3BucketEnv, cfg.Bucket)
	os.Setenv(mcpS3RegionEnv, region)
	os.Setenv(mcpS3AccessKeyEnv, cfg.AccessKeyId)
	os.Setenv(mcpS3SecretEnv, cfg.SecretAccessKey)
	os.Setenv(mcpS3EndpointEnv, strings.TrimSpace(cfg.Endpoint))
}

// FemResultsS3URI returns the s3:// URI of the Parquet FEM results of a
// slide's 3D model and the version of the set (its metadata.json's ETag
// and date, uploaded last): "" when there is no complete set to query.
// slideId "": the first slide, in the order of the layout, that has a
// complete set. The AI agents compare the version to notice results
// converted, updated or deleted after they started. err: the bucket (or
// the admin API) could not be asked.
func (fm *FlowsManager) FemResultsS3URI(ctx context.Context, orgId, groupId, digitalTwinId int, slideId string) (uri string, version string, err error) {
	if fm.S3Client == nil || fm.S3BucketName == "" {
		return "", "", nil
	}
	slides := []string{slideId}
	if slideId == "" {
		models, err := fm.Admin.GetSlideModels(ctx, groupId, digitalTwinId)
		if err != nil {
			return "", "", err
		}
		slides = slides[:0]
		for _, m := range models {
			if m.FemResults > 0 {
				slides = append(slides, m.SlideId)
			}
		}
	}
	for _, slide := range slides {
		prefix := femResultsParquetPrefix(orgId, groupId, digitalTwinId, slide)
		version, err = utils.S3ObjectVersion(ctx, fm.S3Client, fm.S3BucketName, prefix+"/metadata.json")
		if err != nil {
			return "", "", err
		}
		if version != "" {
			return fmt.Sprintf("s3://%s/%s", fm.S3BucketName, prefix), version, nil
		}
	}
	return "", "", nil
}

// AddFemResultsInDigitalTwin turns the digital twin's FEM results JSON
// into Parquet in the bucket, unless that is already done. Called on the
// admin API's femResults "create" message.
func (fm *FlowsManager) AddFemResultsInDigitalTwin(ctx context.Context, digitalTwinId int, slideId string) error {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		return common.ErrNotFound
	}
	// Long (a large mesh takes a while): not in the admin message loop.
	go func() {
		if err := fm.processFemResults(context.WithoutCancel(ctx), digitalTwin, slideId); err != nil {
			fm.log.Errorf("FEM results of digital twin %d (slide %q): %v", digitalTwinId, slideId, err)
		}
	}()
	return nil
}

// AddFemResultsInDigitalTwins runs at startup and only CHECKS: it turns a
// digital twin's JSON into Parquet only when the bucket has no current
// Parquet set for it — FEM results uploaded before this version, or a
// conversion that failed. Normally it finds every set current and does
// nothing. Done by replica 1 only, in the background.
func (fm *FlowsManager) AddFemResultsInDigitalTwins(ctx context.Context) error {
	if fm.ReplicaIndex != 1 {
		return nil
	}
	digitalTwins := fm.GetDigitalTwins()
	go func() {
		bg := context.WithoutCancel(ctx)
		for _, dt := range digitalTwins {
			models, err := fm.Admin.GetSlideModels(bg, dt.GroupId, dt.Id)
			if err != nil {
				fm.log.Errorf("FEM results of digital twin %d: the slides with 3D models could not be read: %v", dt.Id, err)
				continue
			}
			for _, m := range models {
				if m.FemResults == 0 {
					continue
				}
				if err := fm.processFemResults(bg, dt, m.SlideId); err != nil {
					fm.log.Errorf("FEM results of digital twin %d (slide %q): %v", dt.Id, m.SlideId, err)
				}
			}
		}
	}()
	return nil
}

// DeleteFemResultsInDigitalTwin removes the digital twin's Parquet FEM
// results from the bucket. Idempotent: every replica may do it.
func (fm *FlowsManager) DeleteFemResultsInDigitalTwin(digitalTwinId int, slideId string) error {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		return common.ErrNotFound
	}
	return fm.deleteFemResultsParquet(context.Background(), digitalTwin, slideId)
}

func (fm *FlowsManager) deleteFemResultsParquet(ctx context.Context, dt *common.DigitalTwin, slideId string) error {
	if fm.S3Client == nil || fm.S3BucketName == "" {
		return nil
	}
	prefix := femResultsParquetPrefix(dt.OrgId, dt.GroupId, dt.Id, slideId) + "/"
	if err := utils.DeleteS3Prefix(ctx, fm.S3Client, fm.S3BucketName, prefix); err != nil {
		return fmt.Errorf("error deleting the Parquet FEM results: %w", err)
	}
	return nil
}

func (fm *FlowsManager) processFemResults(ctx context.Context, dt *common.DigitalTwin, slideId string) error {
	if fm.S3Client == nil || fm.S3BucketName == "" {
		return fmt.Errorf("no S3 client")
	}
	infos := fm.Admin.GetS3DigitalTwinFolderInfo(ctx, dt.GroupId, dt.Id, femResultsJSONFolder, slideId)
	if len(infos) == 0 {
		return nil // no FEM results
	}
	fileName := filepath.Base(infos[0].FileName)
	lastModified := infos[0].LastModified
	prefix := femResultsParquetPrefix(dt.OrgId, dt.GroupId, dt.Id, slideId)

	if fm.femResultsCurrent(ctx, prefix, fileName, lastModified) {
		return nil
	}

	release, ok := fm.lockFemResults(ctx, dt.Id, slideId)
	if !ok {
		return nil // another replica is converting it
	}
	defer release()
	// Checked again under the lock: the replica that held it may just
	// have finished.
	if fm.femResultsCurrent(ctx, prefix, fileName, lastModified) {
		return nil
	}

	start := time.Now()
	fm.log.Infof("Converting FEM results %s of digital twin %d (slide %q) to Parquet", fileName, dt.Id, slideId)

	tmpDir, err := os.MkdirTemp("", fmt.Sprintf("femres_dt_%d_%s_", dt.Id, slideId))
	if err != nil {
		return fmt.Errorf("error creating a temporary directory: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	data, err := fm.Admin.DownloadDigitalTwinFile(ctx, dt.GroupId, dt.Id, femResultsJSONFolder, fileName, slideId)
	if err != nil {
		return fmt.Errorf("error downloading %s: %w", fileName, err)
	}
	jsonPath := filepath.Join(tmpDir, fileName)
	if err := os.WriteFile(jsonPath, data, 0o600); err != nil {
		return fmt.Errorf("error writing %s: %w", jsonPath, err)
	}
	data = nil

	parquetDir := filepath.Join(tmpDir, "parquet")
	processor := utils.NewFemResultsProcessor(parquetDir, fileName, lastModified)
	if err := processor.ProcessJSONFile(jsonPath); err != nil {
		return fmt.Errorf("error converting %s: %w", fileName, err)
	}
	_ = os.Remove(jsonPath)

	// The previous set goes first: a new mesh may have fewer files.
	if err := fm.deleteFemResultsParquet(ctx, dt, slideId); err != nil {
		return err
	}
	if err := fm.uploadFemResultsParquet(ctx, parquetDir, prefix); err != nil {
		return err
	}

	fm.log.Infof("FEM results of digital twin %d converted and uploaded to s3://%s/%s (took %v)",
		dt.Id, fm.S3BucketName, prefix, time.Since(start).Round(time.Millisecond))
	return nil
}

// uploadFemResultsParquet uploads the Parquet files, then metadata.json:
// the marker that the set is complete.
func (fm *FlowsManager) uploadFemResultsParquet(ctx context.Context, dir, prefix string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("error reading %s: %w", dir, err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && e.Name() != "metadata.json" {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	names = append(names, "metadata.json")
	for _, name := range names {
		if err := utils.UploadFileToS3WithContext(ctx, fm.S3Client, fm.S3BucketName,
			filepath.Join(dir, name), prefix+"/"+name); err != nil {
			return err
		}
	}
	return nil
}

func (fm *FlowsManager) femResultsCurrent(ctx context.Context, prefix, fileName, lastModified string) bool {
	meta, found, err := utils.GetS3Object(ctx, fm.S3Client, fm.S3BucketName, prefix+"/metadata.json")
	if err != nil {
		fm.log.Errorf("%v", err)
		return false
	}
	return found && utils.FemResultsMetadataMatches(meta, fileName, lastModified)
}

// lockFemResults takes the digital twin's conversion lock in the leader
// KV store. ok is false when another replica holds it. Without a KV store
// (a single process in local mode) it always succeeds.
func (fm *FlowsManager) lockFemResults(ctx context.Context, digitalTwinId int, slideId string) (release func(), ok bool) {
	kv := fm.GetLeaderKvStore()
	if kv == nil {
		return func() {}, true
	}
	key := "femres_dt_" + strconv.Itoa(digitalTwinId)
	if slideId != "" {
		key += "_" + slideId
	}
	if _, err := kv.Create(ctx, key, []byte(strconv.Itoa(fm.ReplicaIndex))); err != nil {
		return nil, false
	}
	return func() { _ = kv.Delete(context.Background(), key) }, true
}
