import parquet from 'parquetjs';
import fs from 'fs';
import { getAllTopics } from "../pg/pgQueries";
import { getLastMeasurements } from "../timescaledb/timescaledbQueries";
import process_env from '../config/env_config';
import s3Client from '../config/s3Confing';
import { PutObjectCommand } from '@aws-sdk/client-s3';


export const s3Storage = async () => {
    const topics = await getAllTopics();
    const year = new Date().getFullYear();
    const todayString = new Date().toISOString().slice(0, 10);
    const fileName = `${todayString}.parquet`;
    for (const topic of topics) {
        const measurements = await getLastMeasurements(topic.groupUid, topic.topicUid);
        const parquetSchema = JSON.parse(topic.parquetSchema);
        const schema = new parquet.ParquetSchema(parquetSchema);
        const writer = await parquet.ParquetWriter.openFile(schema, fileName);
        for (const measurement of measurements) {
            const payload = JSON.parse(measurement.payload)
            await writer.appendRow(payload);
        }
        await writer.close();

        const fileStream = fs.createReadStream(fileName);
        fileStream.on('error', (err) => {
          console.log('File error', err);
        });

        const orgId = topic.orgId;
        const groupId = topic.groupId;
        const assetId = topic.assetId;
        const folderName = topic.s3Folder;
        const key = `org_${orgId}/group_${groupId}/asset_${assetId}/${folderName}/${year}/${todayString}`;
        const bucketParams = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: key,
			Body: fileStream
		};
        await s3Client.send(new PutObjectCommand(bucketParams));
        if (fs.existsSync(fileName)) {
            fs.rmSync(fileName);
        }
    }
}