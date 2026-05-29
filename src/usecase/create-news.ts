import { z } from 'zod';
import type { NewsRepository } from '../ports/external/news-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

const createNewsRequestSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    content: z.string().min(1, 'Content is required'),
    summary: z.string().optional(),
    status: z.enum(['PUBLICADO', 'NAO_PUBLICADO'] as const).default('NAO_PUBLICADO'),
    publishedAt: z.iso.datetime().optional(),
});

type CreateNewsRequest = z.input<typeof createNewsRequestSchema>;

type CreateNewsResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    newsId?: string;
};

export class CreateNewsUseCase {
    constructor(
        private readonly newsRepository: NewsRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: CreateNewsRequest, token: string): Promise<CreateNewsResponse> {
        const auth = await verifyPermission(token, 'CREATE_NEWS', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };

        const validation = createNewsRequestSchema.safeParse(request);
        if (!validation.success) {
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const { title, content, summary, status, publishedAt } = validation.data;

        const news = await this.newsRepository.create({
            title,
            content,
            summary,
            status,
            publishedAt: publishedAt ? new Date(publishedAt) : status === 'PUBLICADO' ? new Date() : undefined,
        });

        return { success: true, newsId: news.id };
    }
}
