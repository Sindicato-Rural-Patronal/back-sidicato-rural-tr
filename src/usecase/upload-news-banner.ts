import type { NewsRepository } from '../ports/external/news-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';

const NEWS_BANNER_BUCKET = process.env.NEWS_BANNER_BUCKET || 'news-banners';

type UploadNewsBannerResponse = {
    error?: Error;
    url?: string;
};

export class UploadNewsBannerUseCase {
    constructor(
        private readonly storage: StorageRepository,
        private readonly newsRepository: NewsRepository,
    ) {}

    async execute(
        newsId: string,
        file: Buffer,
        mimeType: string,
    ): Promise<UploadNewsBannerResponse> {
        console.log(`[UploadNewsBanner] newsId="${newsId}" mimeType="${mimeType}"`);
        const news = await this.newsRepository.findById(newsId);
        if (!news) return { error: new NewsNotFoundError() };

        const key = `news/${newsId}/banner.jpg`;

        await this.storage.uploadFile({
            bucket: NEWS_BANNER_BUCKET,
            key,
            body: file,
            contentType: mimeType,
        });

        const url = this.storage.getPublicUrl(NEWS_BANNER_BUCKET, key);
        await this.newsRepository.updateBanner(newsId, url);

        console.log(`[UploadNewsBanner] success url="${url}"`);
        return { url };
    }
}
