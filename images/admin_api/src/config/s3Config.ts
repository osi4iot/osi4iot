import { S3Client } from '@aws-sdk/client-s3';
import process_env from './api_config';

const s3 = new S3Client({
	credentials: {
		accessKeyId: process_env.PLATFORM_ADMIN_USER_NAME,
		secretAccessKey: process_env.PLATFORM_ADMIN_PASSWORD,
	},
	endpoint: `http://minio:9000/`,
	forcePathStyle: true,
	region: "eu-west-3"
});


export default s3;