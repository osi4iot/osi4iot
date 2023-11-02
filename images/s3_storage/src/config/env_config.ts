import fs from "fs";
import 'dotenv/config'

interface IProcessEnv extends Record<string, string> {
	DEPLOYMENT_LOCATION: string;
	DEFAULT_TIME_ZONE: string;
	S3_BUCKET_TYPE: string;
	POSTGRES_USER: string;
	POSTGRES_PASSWORD: string;
	POSTGRES_DB: string;
	TIMESCALE_USER: string;
	TIMESCALE_PASSWORD: string;
	TIMESCALE_DB: string;
	S3_BUCKET_NAME: string;
	AWS_ACCESS_KEY_ID: string;
	AWS_SECRET_ACCESS_KEY: string;
	AWS_REGION: string;
}

const process_env: IProcessEnv = {
	DEPLOYMENT_LOCATION: process.env.DEPLOYMENT_LOCATION as string,
	DEFAULT_TIME_ZONE: process.env.DEFAULT_TIME_ZONE as string,
	S3_BUCKET_TYPE: process.env.S3_BUCKET_TYPE as string,
	POSTGRES_USER: process.env.POSTGRES_USER as string,
	POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD as string,
	POSTGRES_DB: process.env.POSTGRES_DB as string,
	TIMESCALE_USER: process.env.TIMESCALE_USER as string,
	TIMESCALE_PASSWORD: process.env.TIMESCALE_PASSWORD as string,
	TIMESCALE_DB: process.env.TIMESCALE_DB as string,
	S3_BUCKET_NAME: process.env.S3_BUCKET_NAME as string,
	AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID as string,
	AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY as string,
	AWS_REGION: process.env.AWS_REGION as string,
};


const readDockerFiles = (dockerFileName: string) => {
	if (fs.existsSync(dockerFileName)) {
		try {
			const data = fs.readFileSync(dockerFileName, {encoding:'utf8', flag:'r'});
			const lines = data.split(/\r?\n/);
			lines.forEach((line) => {
				const splittedLine = line.split("=");
				if (splittedLine.length === 2) {
					const envName = splittedLine[0];
                    const envValue = splittedLine[1].replace(/"/g, "");
                    process_env[envName] = envValue;
				}
			});

        } catch (err: any) {
			console.error(`An error occurred while trying to read the file: ${dockerFileName}:  %s`, err.message);
		}
	}
};

readDockerFiles("/run/secrets/s3_storage.txt");
readDockerFiles("/run/configs/s3_storage.conf");


export default process_env;