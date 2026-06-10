import type { NewsRepository } from '../ports/external/news-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';

const NEWS_BANNER_BUCKET = process.env.NEWS_BANNER_BUCKET || 'news-banners';

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
        console.log(`[UploadNewsBlockImage] newsId="${newsId}" mimeType="${mimeType}"`);
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
        console.log(`[UploadNewsBlockImage] success url="${url}"`);
        return { url };
    }
}
