import { S3Client } from '@aws-sdk/client-s3';
import process_env from './env_config';

let s3Client: S3Client;

if (process_env.DEPLOYMENT_LOCATION === "AWS cluster deployment" ||
	process_env.S3_BUCKET_TYPE === "Cloud AWS S3"
) {
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
		region: "eu-west-3"
	});
}


export default s3Client;