import type { NewsRepository } from '../ports/external/news-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { toJpeg, UNREADABLE_IMAGE, validateImageUpload } from '../lib/image-upload.js';
import { buckets } from '../lib/buckets.js';

const NEWS_BANNER_BUCKET = buckets.newsBanners;
// Capa da notícia: topo da página e cards; não precisa de mais que isso.
const NEWS_BANNER_MAX_SIDE = 1920;

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
        const invalid = validateImageUpload(file, mimeType);
        if (invalid) return { error: new ValidationError(invalid) };

        const news = await this.newsRepository.findById(newsId);
        if (!news) return { error: new NewsNotFoundError() };

        const jpeg = await toJpeg(file, NEWS_BANNER_MAX_SIDE);
        if (!jpeg) return { error: new ValidationError(UNREADABLE_IMAGE) };

        const key = `news/${newsId}/banner.jpg`;

        await this.storage.uploadFile({
            bucket: NEWS_BANNER_BUCKET,
            key,
            body: jpeg,
            contentType: 'image/jpeg',
        });

        // key é determinístico (banner.jpg) → URL pública é sempre igual.
        // Sem cache-bust, o browser/React não percebem a troca da imagem.
        // Mesmo padrão do upload-banner-course.
        const url = `${this.storage.getPublicUrl(NEWS_BANNER_BUCKET, key)}?t=${Date.now()}`;
        await this.newsRepository.updateBanner(newsId, url);

        return { url };
    }
}
