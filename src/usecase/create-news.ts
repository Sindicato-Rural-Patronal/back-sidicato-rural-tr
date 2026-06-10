import { z } from 'zod';
import type { NewsRepository } from '../ports/external/news-repository.js';
import { ValidationError } from '../errors/validation.js';

const createNewsRequestSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    content: z.string().min(1, 'Content is required'),
    summary: z.string().optional(),
    status: z.enum(['PUBLICADO', 'NAO_PUBLICADO'] as const).default('NAO_PUBLICADO'),
    publishedAt: z.iso.datetime().optional(),
});

type CreateNewsRequest = z.input<typeof createNewsRequestSchema>;
type CreateNewsResponse = {
    error?: Error;
    newsId?: string;
};

export class CreateNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(request: CreateNewsRequest): Promise<CreateNewsResponse> {
        console.log(
            `[CreateNews] title="${request.title}" status="${request.status ?? 'default'}"`,
        );
        const validation = createNewsRequestSchema.safeParse(request);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const { title, content, summary, status, publishedAt } = validation.data;

        const news = await this.newsRepository.create({
            title,
            content,
            summary,
            status,
            publishedAt: publishedAt
                ? new Date(publishedAt)
                : status === 'PUBLICADO'
                  ? new Date()
                  : undefined,
        });

        console.log(`[CreateNews] success newsId="${news.id}"`);
        return { newsId: news.id };
    }
}
