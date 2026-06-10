// adapters/s3-storage.adapter.ts
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getSignedUrlS3 } from '@aws-sdk/s3-request-presigner';

import type { Readable } from 'stream';
import type {
    StorageRepository,
    UploadParams,
    UploadResult,
} from '../../ports/external/storage-repository';

export class S3StorageAdapter implements StorageRepository {
    private client: S3Client;

    constructor() {
        this.client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            // Credenciais serão obtidas do ambiente (IAM, ~/.aws, ou env vars)
        });
    }

    async uploadFile(params: UploadParams): Promise<UploadResult> {
        const command = new PutObjectCommand({
            Bucket: params.bucket,
            Key: params.key,
            Body: params.body,
            ContentType: params.contentType,
        });

        await this.client.send(command);

        // Constroi uma URL pública (se o bucket for público) ou apenas o identificador
        const location = `https://${params.bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${params.key}`;
        return { location,
key: params.key,
bucket: params.bucket };
    }

    async downloadFile(bucket: string, key: string): Promise<Readable> {
        const command = new GetObjectCommand({ Bucket: bucket,
Key: key });
        const response = await this.client.send(command);
        return response.Body as Readable;
    }

    async getSignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<string> {
        const command = new GetObjectCommand({ Bucket: bucket,
Key: key });
        return getSignedUrlS3(this.client, command, { expiresIn });
    }

    getPublicUrl(bucket: string, key: string): string {
        const region = process.env.AWS_REGION || 'us-east-1';
        return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    }

    async deleteFile(bucket: string, key: string): Promise<void> {
        const command = new DeleteObjectCommand({ Bucket: bucket,
Key: key });
        await this.client.send(command);
    }
}
