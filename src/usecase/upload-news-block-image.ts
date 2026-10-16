import type { NewsRepository } from '../ports/external/news-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { toJpeg, UNREADABLE_IMAGE, validateImageUpload } from '../lib/image-upload.js';
import { buckets } from '../lib/buckets.js';

const NEWS_BANNER_BUCKET = buckets.newsBanners;
// Imagem dentro do texto da notícia.
const NEWS_BLOCK_MAX_SIDE = 1600;

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
        const invalid = validateImageUpload(file, mimeType);
        if (invalid) return { error: new ValidationError(invalid) };

        const news = await this.newsRepository.findById(newsId);
        if (!news) return { error: new NewsNotFoundError() };

        const jpeg = await toJpeg(file, NEWS_BLOCK_MAX_SIDE);
        if (!jpeg) return { error: new ValidationError(UNREADABLE_IMAGE) };

        const timestamp = Date.now();
        const key = `news/${newsId}/blocks/${timestamp}.jpg`;

        await this.storage.uploadFile({
            bucket: NEWS_BANNER_BUCKET,
            key,
            body: jpeg,
            contentType: 'image/jpeg',
        });

        const url = this.storage.getPublicUrl(NEWS_BANNER_BUCKET, key);
        return { url };
    }
}
