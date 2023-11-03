import parquet from 'parquetjs';
import fs from 'fs';
import { getAllTopics, updateLastS3Storage } from "../pg/pgQueries";
import { getLastMeasurements } from "../timescaledb/timescaledbQueries";
import process_env from '../config/env_config';
import s3Client from '../config/s3Confing';
import { PutObjectCommand } from '@aws-sdk/client-s3';


export const s3Storage = async () => {
    const topics = await getAllTopics();
    const year = new Date().getFullYear();
    const todayString = new Date().toISOString().slice(0, 10);
    const fileName = `${todayString}.parquet`;
    if (topics.length !== 0) {
        console.log(`Beginning store for day ${todayString}`);
    }
    for (const topic of topics) {
        const measurements = await getLastMeasurements(topic.groupUid, topic.topicUid);
        const parquetSchema = topic.parquetSchema;
        if (Object.keys(parquetSchema).length !== 0) {
            console.log(`Storing data for topicId: ${topic.topicId}`);
            const startTime = new Date().getTime();
            const schema = new parquet.ParquetSchema(parquetSchema);
            const filePath = `/app/data/${fileName}`;
            const writer = await parquet.ParquetWriter.openFile(schema, filePath);
            for (const measurement of measurements) {
                const payload = JSON.parse(measurement.payload)
                const timestamp = measurement.timestamp;
                const data = { timestamp, ...payload };
                await writer.appendRow(data);
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
            const key = `org_${orgId}/group_${groupId}/asset_${assetId}/${folderName}/${year}/${fileName}`;
            const bucketParams = {
                Bucket: process_env.S3_BUCKET_NAME,
                Key: key,
                Body: fileStream
            };
            await s3Client.send(new PutObjectCommand(bucketParams));
            if (fs.existsSync(filePath)) {
                fs.rmSync(filePath);
            }
            await updateLastS3Storage(topic.topicId);
            const endTime = new Date().getTime();
            const timeElapsed = (endTime - startTime) / 1000.0;
            console.log(`TopicId: ${topic.topicId} stored. Elapsed time: ${timeElapsed}secs`);
        }
    }
    console.log(`Data storage for day ${todayString} has finished\n`);
}