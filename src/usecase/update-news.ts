import { z } from 'zod';
import type { NewsRepository } from '../ports/external/news-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

const updateNewsRequestSchema = z.object({
    newsId: z.string().uuid(),
    token: z.string(),
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    summary: z.string().optional().nullable(),
    status: z.enum(['PUBLICADO', 'NAO_PUBLICADO'] as const).optional(),
    publishedAt: z.iso.datetime().optional().nullable(),
});

type UpdateNewsRequest = z.infer<typeof updateNewsRequestSchema>;

type UpdateNewsResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
};

export class UpdateNewsUseCase {
    constructor(
        private readonly newsRepository: NewsRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: UpdateNewsRequest): Promise<UpdateNewsResponse> {
        console.log(`[UpdateNews] newsId="${request.newsId}"`);
        const validation = updateNewsRequestSchema.safeParse(request);
        if (!validation.success) {
            console.log(`[UpdateNews] validation failed: ${validation.error.issues.map(e => e.message).join(', ')}`);
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const { newsId, token, publishedAt, ...updateData } = validation.data;
        console.log(`[UpdateNews] fields to update: ${JSON.stringify(Object.keys(updateData))}`);

        const auth = await verifyPermission(token, 'UPDATE_NEWS', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[UpdateNews] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const existing = await this.newsRepository.findById(newsId);
        if (!existing) return { success: false, error: new Error('News not found') };

        const updated = await this.newsRepository.update(newsId, {
            ...updateData,
            publishedAt: publishedAt !== undefined
                ? (publishedAt ? new Date(publishedAt) : null)
                : updateData.status === 'PUBLICADO' && !existing.publishedAt
                    ? new Date()
                    : undefined,
        });

        if (!updated) return { success: false, error: new Error('Failed to update news') };

        console.log(`[UpdateNews] success newsId="${newsId}"`);
        return { success: true };
    }
}
