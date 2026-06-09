import type { NewsRepository } from '../ports/external/news-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

const NEWS_BANNER_BUCKET = process.env.NEWS_BANNER_BUCKET || 'news-banners';

type UploadNewsBannerResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    url?: string;
};

export class UploadNewsBannerUseCase {
    constructor(
        private readonly storage: StorageRepository,
        private readonly newsRepository: NewsRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(newsId: string, token: string, file: Buffer, mimeType: string): Promise<UploadNewsBannerResponse> {
        console.log(`[UploadNewsBanner] newsId="${newsId}" mimeType="${mimeType}"`);
        const auth = await verifyPermission(token, 'UPDATE_NEWS', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[UploadNewsBanner] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const news = await this.newsRepository.findById(newsId);
        if (!news) return { success: false, error: new Error('News not found') };

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
        return { success: true, url };
    }
}
