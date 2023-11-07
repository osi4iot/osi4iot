import parquet from 'parquetjs';
import fs from 'fs';
import { getAllTopics, updateLastS3Storage } from "../pg/pgQueries";
import { getLastMeasurements } from "../timescaledb/timescaledbQueries";
import process_env from '../config/env_config';
import s3Client from '../config/s3Confing';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import ITopic from '../pg/topic.interface';

const topicStorage = async (year: number, todayString: string, topic: ITopic) => {
    const folderName = topic.s3Folder.replace(/ /g, "_");
    const fileName = `${folderName.toLowerCase()}_${todayString}.parquet`;
    const measurements = await getLastMeasurements(topic.groupUid, topic.topicUid);
    const parquetSchema = topic.parquetSchema;
    const schemaFields = Object.keys(parquetSchema);
    for (const field of schemaFields) {
        parquetSchema[field].compression = 'SNAPPY';
    }
    if (Object.keys(parquetSchema).length !== 0 && measurements.length !== 0) {
        try {
            const startTime = new Date().getTime();
            const schema = new parquet.ParquetSchema(parquetSchema);
            const filePath = `/data/${fileName}`;
            const writer = await parquet.ParquetWriter.openFile(schema, filePath);
            for (const measurement of measurements) {
                const payload = measurement.payload
                const timestamp = measurement.timestamp;
                const data = { timestamp, ...payload };
                await writer.appendRow(data);
            }
            await writer.close();

            const fileStream = fs.createReadStream(filePath);
            fileStream.on('error', (err) => {
                console.log('File error', err);
            });
            const orgId = topic.orgId;
            const groupId = topic.groupId;
            const assetId = topic.assetId;
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
            console.log(`Data for topicId: ${topic.topicId} has been stored successfully. Elapsed time: ${timeElapsed}sec`);
        } catch (err: any) {
            console.log("Something was wrong:", err.message);
        }
    }
}

export const s3Storage = async () => {
    const topics = await getAllTopics();
    const year = new Date().getFullYear();
    const todayString = new Date().toISOString().slice(0, 10);
    if (topics.length !== 0) {
        console.log(`Beginning storage for day ${todayString}`);
    }
    const topicsStorageQuery = [];
    for (const topic of topics) {
        topicsStorageQuery.push(topicStorage(year, todayString, topic));
    }
    await Promise.all(topicsStorageQuery);

    if (topics.length !== 0) {
        console.log(`Data storage for day ${todayString} has finished\n`);
    }
}