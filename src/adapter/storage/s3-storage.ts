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
    private region: string;

    constructor() {
        this.region = process.env.AWS_REGION || 'us-east-1';
        // S3_ENDPOINT set → S3-compatible provider (Supabase, MinIO, R2, etc.)
        const endpoint = process.env.S3_ENDPOINT;
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

        this.client = new S3Client({
            region: this.region,
            ...(endpoint
                ? { endpoint,
forcePathStyle: true }
                : {}),
            // Explicit creds when provided; otherwise fall back to the SDK default chain (IAM, ~/.aws).
            ...(accessKeyId && secretAccessKey
                ? { credentials: { accessKeyId,
secretAccessKey } }
                : {}),
        });
    }

    // Public URL base. Supabase serves public objects at a different host than the S3 API,
    // so S3_PUBLIC_URL must be set (e.g. https://<ref>.supabase.co/storage/v1/object/public).
    private publicBase(bucket: string, key: string): string {
        const base = process.env.S3_PUBLIC_URL;
        if (base) return `${base.replace(/\/$/, '')}/${bucket}/${key}`;
        return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }

    async uploadFile(params: UploadParams): Promise<UploadResult> {
        const command = new PutObjectCommand({
            Bucket: params.bucket,
            Key: params.key,
            Body: params.body,
            ContentType: params.contentType,
        });

        await this.client.send(command);

        return { location: this.publicBase(params.bucket, params.key),
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
        return this.publicBase(bucket, key);
    }

    async deleteFile(bucket: string, key: string): Promise<void> {
        const command = new DeleteObjectCommand({ Bucket: bucket,
Key: key });
        await this.client.send(command);
    }
}
