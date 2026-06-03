import { S3Client } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import process_env from "./api_config";

let s3Client: S3Client;

// if (process_env.DEPLOYMENT_LOCATION === "AWS cluster deployment" || process_env.S3_BUCKET_TYPE === "Cloud AWS S3") {
if (process_env.S3_BUCKET_TYPE === "Cloud AWS S3") {
	s3Client = new S3Client({
		credentials: {
			accessKeyId: process_env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process_env.AWS_SECRET_ACCESS_KEY,
		},
		forcePathStyle: true,
		region: process_env.AWS_REGION,
	});
} else {
	s3Client = new S3Client({
		credentials: {
			accessKeyId: process_env.PLATFORM_ADMIN_USER_NAME,
			secretAccessKey: process_env.PLATFORM_ADMIN_PASSWORD,
		},
		endpoint: `http://minio:9000/`,
		forcePathStyle: true,
		region: "eu-west-3",
	});
}

s3Client.middlewareStack.add(
	(next) => async (args: any) => {
		const { request } = args;
		if (
			request.method === "POST" &&
			request.query?.delete !== undefined &&
			request.body &&
			!request.headers["content-md5"]
		) {
			const bodyStr =
				typeof request.body === "string"
					? request.body
					: Buffer.isBuffer(request.body)
						? request.body.toString("utf-8")
						: "";

			if (bodyStr) {
				request.headers["content-md5"] = createHash("md5").update(bodyStr).digest("base64");
			}
		}
		return next(args);
	},
	{
		step: "finalizeRequest",
		name: "addContentMD5ForDeleteObjects",
		priority: "high",
	}
);

export default s3Client;
