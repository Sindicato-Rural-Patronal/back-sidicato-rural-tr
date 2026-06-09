import type { NewsRepository } from '../ports/external/news-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

type DeleteNewsResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
};

export class DeleteNewsUseCase {
    constructor(
        private readonly newsRepository: NewsRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(newsId: string, token: string): Promise<DeleteNewsResponse> {
        console.log(`[DeleteNews] newsId="${newsId}"`);
        const auth = await verifyPermission(token, 'DELETE_NEWS', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[DeleteNews] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const existing = await this.newsRepository.findById(newsId);
        if (!existing) {
            console.log(`[DeleteNews] news not found: ${newsId}`);
            return { success: false, error: new Error('News not found') };
        }

        const deleted = await this.newsRepository.delete(newsId);
        if (!deleted) return { success: false, error: new Error('Failed to delete news') };

        console.log(`[DeleteNews] success`);
        return { success: true };
    }
}
