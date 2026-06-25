import type { StorageRepository, UploadParams } from '../ports/external/storage-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { UserDataNotFoundError } from '../errors/not-found.js';

export interface UploadAvatarInput {
    userId: string;
    file: Buffer;
    mimeType: string;
    originalName: string;
}

type UploadAvatarResponse = {
    error?: Error;
    avatarUrl?: string;
};

export class UploadAvatarUseCase {
    constructor(
        private readonly storage: StorageRepository,
        private readonly userDataRepository: UserDataRepository,
    ) {}

    async execute(input: UploadAvatarInput): Promise<UploadAvatarResponse> {
        const user = await this.userDataRepository.findById(input.userId);
        if (!user) return { error: new UserDataNotFoundError() };

        const bucket = process.env.STORAGE_BUCKET ?? 'avatars';
        const key = `users/${input.userId}/avatar-${Date.now()}-${input.originalName}`;

        const uploadParams: UploadParams = {
            bucket,
            key,
            body: input.file,
            contentType: input.mimeType,
        };

        await this.storage.uploadFile(uploadParams);
        const avatarUrl = this.storage.getPublicUrl(bucket, key);

        await this.userDataRepository.update(input.userId, { avatar: avatarUrl });

        return { avatarUrl };
    }
}
