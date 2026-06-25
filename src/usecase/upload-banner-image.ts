import sharp from 'sharp';
import { BannerNotFoundError } from '../errors/not-found.js';
import type { BannerRepository } from '../ports/external/banner-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';

const BANNER_BUCKET = process.env.BANNER_BUCKET || 'course-banners';
const BANNER_WIDTH = 1440;
const BANNER_HEIGHT = 600;

type Response = { error?: Error; imageUrl?: string };

export class UploadBannerImageUseCase {
    constructor(
        private readonly repo: BannerRepository,
        private readonly storage: StorageRepository,
    ) {}

    async execute(id: string, fileBuffer: Buffer): Promise<Response> {
        const banner = await this.repo.findById(id);
        if (!banner) return { error: new BannerNotFoundError() };

        const processed = await sharp(fileBuffer)
            .resize(BANNER_WIDTH, BANNER_HEIGHT, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 85 })
            .toBuffer();

        const key = `home-banners/${id}/image.jpg`;
        await this.storage.uploadFile({
            bucket: BANNER_BUCKET,
            key,
            body: processed,
            contentType: 'image/jpeg',
        });

        const publicUrl = this.storage.getPublicUrl(BANNER_BUCKET, key);
        const imageUrl = `${publicUrl}?t=${Date.now()}`;

        await this.repo.update(id, { imageUrl });
        return { imageUrl };
    }
}
