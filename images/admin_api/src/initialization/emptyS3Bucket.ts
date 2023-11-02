import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import process_env from "../config/api_config";
import s3Client from "../config/s3Config";
import { deleteBucketFiles } from "../components/digitalTwin/digitalTwinDAL";
import { logger } from "../config/winston";

export const emptyBucket = async () => {
	const bucketName = process_env.S3_BUCKET_NAME;
	const bucketParams = {
		Bucket:  bucketName,
		MaxKeys: 1,
	};
	const command = new ListObjectsV2Command(bucketParams);
	const fileListToRemove: string[] = [];
	try {
		let isTruncated = true;
		while (isTruncated) {
			const data = await s3Client.send(command);
			fileListToRemove.push(...data.Contents.map(fileData => fileData.Key))
			isTruncated = data.IsTruncated;
			command.input.ContinuationToken = data.NextContinuationToken;
		}
		await deleteBucketFiles(fileListToRemove);
		logger.log("info", `Bucket ${bucketName} has been emptied`);
	} catch (err) {
		logger.log("error", `Bucket ${bucketName} could not be emptied: %s`, err.message)
	}
};