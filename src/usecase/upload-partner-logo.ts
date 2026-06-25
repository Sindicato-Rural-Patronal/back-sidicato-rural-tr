import sharp from 'sharp';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { UserDataNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';

export interface UploadPartnerLogoInput {
    userId: string;
    file: Buffer;
    mimeType: string;
}

type Response = { error?: Error; partnerLogoUrl?: string };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const WIDTH = 300;
const HEIGHT = 150;

export class UploadPartnerLogoUseCase {
    constructor(
        private readonly storage: StorageRepository,
        private readonly userDataRepository: UserDataRepository,
    ) {}

    async execute(input: UploadPartnerLogoInput): Promise<Response> {
        if (!ALLOWED_TYPES.includes(input.mimeType)) {
            return { error: new ValidationError('Tipo de arquivo inválido. Use PNG, JPG ou WebP.') };
        }
        if (input.file.length > MAX_BYTES) {
            return { error: new ValidationError('Arquivo muito grande. Máximo 5MB.') };
        }

        const user = await this.userDataRepository.findById(input.userId);
        if (!user) return { error: new UserDataNotFoundError() };

        const processed = await sharp(input.file)
            .resize(WIDTH, HEIGHT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png({ compressionLevel: 8 })
            .toBuffer();

        const bucket = process.env.STORAGE_BUCKET ?? 'avatars';
        const key = `partner-logos/${input.userId}/logo.png`;

        await this.storage.uploadFile({ bucket, key, body: processed, contentType: 'image/png' });
        const partnerLogoUrl = this.storage.getPublicUrl(bucket, key);

        await this.userDataRepository.update(input.userId, { partnerLogo: partnerLogoUrl });

        return { partnerLogoUrl };
    }
}
