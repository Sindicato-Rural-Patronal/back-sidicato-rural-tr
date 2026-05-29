// adapters/minio-storage.adapter.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getSignedUrlS3 } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";
import type { StorageRepository, UploadParams, UploadResult } from "../../ports/external/storage-repository";

export class MinioStorageAdapter implements StorageRepository {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
      region: "us-east-1", // MinIO não exige região real, mas é obrigatório
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin",
      },
      forcePathStyle: true, // essencial para MinIO
    });
  }

  private async ensureBucket(bucket: string): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      }],
    });
    await this.client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }));
  }

  async uploadFile(params: UploadParams): Promise<UploadResult> {
    await this.ensureBucket(params.bucket);
    const command = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    });

    await this.client.send(command);

    // Gera URL direta do MinIO (pode não ser pública, mas usamos signed url depois)
    const location = `${this.client.config.endpoint?.toString()}${params.bucket}/${params.key}`;
    return { location, key: params.key, bucket: params.bucket };
  }

  async downloadFile(bucket: string, key: string): Promise<Readable> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.client.send(command);
    return response.Body as Readable;
  }

  async getSignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrlS3(this.client, command, { expiresIn });
  }

  getPublicUrl(bucket: string, key: string): string {
    const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    return `${endpoint}/${bucket}/${key}`;
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
    await this.client.send(command);
  }
}