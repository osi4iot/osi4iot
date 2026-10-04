import { S3Client } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import process_env from "./api_config";

// The platform's object store: its own Garage ("Local Garage") or an
// external AWS S3 bucket ("Cloud AWS S3").
//
// Everything that differs between the two comes from the CLI, which
// derives it for every S3 client of the platform from one place
// (utils.S3Region / utils.S3Endpoint / utils.S3CredentialsFor):
//
//   - AWS_REGION    (admin_api config): "us-east-1" with Garage — the
//                   s3_region in garage.toml, which Garage checks in every
//                   signature — or the bucket's region with AWS.
//   - AWS_ENDPOINT  (admin_api config): "http://garage:3900" with Garage,
//                   empty with AWS.
//   - AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (admin_api secret):
//                   admin_api's own Garage key, or the bucket's AWS
//                   credentials.
//
// Nothing about the store is hardcoded here.
const endpoint = (process_env.AWS_ENDPOINT || "").trim();
const region = (process_env.AWS_REGION || "").trim() || "us-east-1";

const s3Client = new S3Client({
	credentials: {
		accessKeyId: process_env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process_env.AWS_SECRET_ACCESS_KEY,
	},
	region,
	// Garage is reached by service name: no virtual-host DNS, so
	// path-style. Harmless with AWS, where it was already set.
	forcePathStyle: true,
	...(endpoint !== "" ? { endpoint } : {}),
});

// DeleteObjects: send the classic Content-MD5 when the SDK did not add
// one. Recent SDK versions send a CRC32 checksum instead; AWS and Garage
// v2 accept either, and Content-MD5 is what every S3 implementation
// accepts, so the request stays portable across object stores.
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
