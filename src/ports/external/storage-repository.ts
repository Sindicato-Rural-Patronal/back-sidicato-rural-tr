import type { Readable } from 'stream';

export interface StorageRepository {
    uploadFile(params: UploadParams): Promise<UploadResult>;
    downloadFile(bucket: string, key: string): Promise<Readable>;
    getSignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
    getPublicUrl(bucket: string, key: string): string;
    deleteFile(bucket: string, key: string): Promise<void>;
}
export interface UploadParams {
    bucket: string;
    key: string;
    body: Buffer | Readable;
    contentType?: string;
}

export interface UploadResult {
    location: string; // URL ou path
    key: string;
    bucket: string;
}
