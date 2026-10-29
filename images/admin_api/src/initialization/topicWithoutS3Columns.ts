import { PoolClient } from "pg";
import { logger } from "../config/winston";

// The S3 storage of the messages of a topic (columns require_s3_storage,
// s3_folder, last_s3_storage and parquet_schema of grafanadb.topic) was never
// used: the parquet files of an asset are kept in grafanadb.s3_folder. New
// databases no longer create those columns and this removes them from older
// ones.
//
// Run on every start of replica 1 for existing databases: DROP COLUMN IF EXISTS
// is a no-op once they are gone. auth_callout must already be the version
// that does not read them (topic.go), or its queries fail until it is updated.

const queryTopicWithoutS3Columns = `
ALTER TABLE grafanadb.topic
	DROP COLUMN IF EXISTS require_s3_storage,
	DROP COLUMN IF EXISTS s3_folder,
	DROP COLUMN IF EXISTS last_s3_storage,
	DROP COLUMN IF EXISTS parquet_schema;`;

export const ensureTopicWithoutS3Columns = async (client: PoolClient): Promise<void> => {
	try {
		await client.query(queryTopicWithoutS3Columns);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.log("error", `The S3 columns of grafanadb.topic could not be removed: %s`, message);
	}
};
