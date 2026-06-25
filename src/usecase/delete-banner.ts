import { BannerNotFoundError } from '../errors/not-found.js';
import type { BannerRepository } from '../ports/external/banner-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';

type Response = { error?: Error };

const BANNER_BUCKET = process.env.BANNER_BUCKET || 'course-banners';

export class DeleteBannerUseCase {
    constructor(
        private readonly repo: BannerRepository,
        private readonly storage: StorageRepository,
    ) {}

    async execute(id: string): Promise<Response> {
        const banner = await this.repo.findById(id);
        if (!banner) return { error: new BannerNotFoundError() };

        if (banner.imageUrl) {
            const key = `home-banners/${id}/image.jpg`;
            await this.storage.deleteFile(BANNER_BUCKET, key).catch(() => {});
        }

        await this.repo.delete(id);
        return {};
    }
}
