import { CronJob } from 'cron';
import process_env from './config/env_config';
import { s3Storage } from './tasks/topicDataStorage';
import express from 'express';

const main = async (): Promise<void> => {
	try {
		const app = express();

		app.get("/", (request, response) => {
			response.send("Hi there");
		});

		app.get('/health', (request, response) => {
			response.send({ success: true, message: "It is working" });
		});

		app.listen(3500, async () => {
			console.log("Listen on the port 3500...");
			await s3Storage();
			const job = new CronJob(
				'0 0 * * *',
				async function () {
					await s3Storage();
				},
				null,
				true,
				process_env.DEFAULT_TIME_ZONE // timeZone
			);
			job.start()
		});

	} catch (error: any) {
		console.log("Server initiation failed: %s ", error.message);
		console.log("error", "Process finished");
		process.exit(1);
	}
}

void main();