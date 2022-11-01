import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import process_env from "../../config/api_config";
import s3Client from "../../config/s3Config";

export const getS3PresignedUrl = async (action: string, key: string): Promise<string> => {
	const actionObjectParams = { Bucket: process_env.S3_BUCKET_NAME, Key: key };
	let url: string;
	if (action === "get") {
		const command = new GetObjectCommand(actionObjectParams);
		url = await getSignedUrl(s3Client, command, { expiresIn: 30 });
	} else if (action === "put") {
		const command = new PutObjectCommand(actionObjectParams) as PutObjectCommand;
		url = await getSignedUrl(s3Client, command, { expiresIn: 60 * 30 });
	}
	return url;
};