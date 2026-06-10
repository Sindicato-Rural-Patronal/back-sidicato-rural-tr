// core/usecases/upload-avatar.usecase.ts
import type { Env } from '../config/env';
import type { StorageRepository, UploadParams } from '../ports/external/storage-repository';

export interface UploadAvatarInput {
    userId: string;
    file: Buffer;
    mimeType: string;
    originalName: string;
}

export class UploadAvatarUseCase {
    constructor(
        private readonly storage: StorageRepository,
        private readonly env: Env,
    ) {}

    async execute(input: UploadAvatarInput): Promise<string> {
        console.log(
            `[UploadAvatar] userId="${input.userId}" file="${input.originalName}" mimeType="${input.mimeType}"`,
        );
        const bucket = this.env.STORAGE_BUCKET || 'avatars';
        const key = `users/${input.userId}/${Date.now()}-${input.originalName}`;

        const uploadParams: UploadParams = {
            bucket,
            key,
            body: input.file,
            contentType: input.mimeType,
        };

        await this.storage.uploadFile(uploadParams);

        const signedUrl = await this.storage.getSignedUrl(bucket, key, 3600);
        console.log(`[UploadAvatar] success key="${key}"`);
        return signedUrl;
    }
}
