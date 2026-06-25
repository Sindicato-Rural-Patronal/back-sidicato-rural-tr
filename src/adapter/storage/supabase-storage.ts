// adapters/supabase-storage.adapter.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Readable } from 'stream';
import type {
    StorageRepository,
    UploadParams,
    UploadResult,
} from '../../ports/external/storage-repository.js';

export class SupabaseStorageAdapter implements StorageRepository {
    private _client?: SupabaseClient;

    // Lazy so the server can boot (and tests can register routers) without storage env.
    private get client(): SupabaseClient {
        if (!this._client) {
            const url = process.env.SUPABASE_URL;
            const secretKey = process.env.SUPABASE_SECRET_KEY;
            if (!url || !secretKey) {
                throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
            }
            this._client = createClient(url, secretKey, {
                auth: { persistSession: false },
            });
        }
        return this._client;
    }

    async uploadFile(params: UploadParams): Promise<UploadResult> {
        const { error } = await this.client.storage.from(params.bucket).upload(params.key, params.body, {
            contentType: params.contentType,
            upsert: true,
        });
        if (error) throw error;

        return { location: this.getPublicUrl(params.bucket, params.key),
key: params.key,
bucket: params.bucket };
    }

    async downloadFile(bucket: string, key: string): Promise<Readable> {
        const { data, error } = await this.client.storage.from(bucket).download(key);
        if (error) throw error;
        return Readable.from(Buffer.from(await data.arrayBuffer()));
    }

    async getSignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<string> {
        const { data, error } = await this.client.storage
            .from(bucket)
            .createSignedUrl(key, expiresIn);
        if (error) throw error;
        return data.signedUrl;
    }

    getPublicUrl(bucket: string, key: string): string {
        return this.client.storage.from(bucket).getPublicUrl(key).data.publicUrl;
    }

    async deleteFile(bucket: string, key: string): Promise<void> {
        const { error } = await this.client.storage.from(bucket).remove([key]);
        if (error) throw error;
    }
}
