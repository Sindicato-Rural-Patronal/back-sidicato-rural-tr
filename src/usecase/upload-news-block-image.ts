import type { NewsRepository } from '../ports/external/news-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';
import { buckets } from '../lib/buckets.js';

const NEWS_BANNER_BUCKET = buckets.newsBanners;

type UploadNewsBlockImageResponse = {
    error?: Error;
    url?: string;
};

export class UploadNewsBlockImageUseCase {
    constructor(
        private readonly storage: StorageRepository,
        private readonly newsRepository: NewsRepository,
    ) {}

    async execute(
        newsId: string,
        file: Buffer,
        mimeType: string,
    ): Promise<UploadNewsBlockImageResponse> {
        const news = await this.newsRepository.findById(newsId);
        if (!news) return { error: new NewsNotFoundError() };

        const timestamp = Date.now();
        const key = `news/${newsId}/blocks/${timestamp}.jpg`;

        await this.storage.uploadFile({
            bucket: NEWS_BANNER_BUCKET,
            key,
            body: file,
            contentType: mimeType,
        });

        const url = this.storage.getPublicUrl(NEWS_BANNER_BUCKET, key);
        return { url };
    }
}
