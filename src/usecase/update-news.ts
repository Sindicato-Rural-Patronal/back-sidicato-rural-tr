import { z } from 'zod';
import type { NewsRepository } from '../ports/external/news-repository.js';
import { ValidationError } from '../errors/validation.js';
import { NewsNotFoundError } from '../errors/not-found.js';

const updateNewsRequestSchema = z.object({
    newsId: z.string().uuid(),
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    summary: z.string().optional().nullable(),
    status: z.enum(['PUBLISHED', 'UNPUBLISHED'] as const).optional(),
    publishedAt: z.iso.datetime().optional().nullable(),
});

type UpdateNewsRequest = z.infer<typeof updateNewsRequestSchema>;
type UpdateNewsResponse = { error?: Error };

export class UpdateNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(request: UpdateNewsRequest): Promise<UpdateNewsResponse> {
        const validation = updateNewsRequestSchema.safeParse(request);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const { newsId, publishedAt, ...updateData } = validation.data;

        const existing = await this.newsRepository.findById(newsId);
        if (!existing) return { error: new NewsNotFoundError() };

        const updated = await this.newsRepository.update(newsId, {
            ...updateData,
            publishedAt:
                publishedAt !== undefined
                    ? publishedAt
                        ? new Date(publishedAt)
                        : null
                    : updateData.status === 'PUBLISHED' && !existing.publishedAt
                      ? new Date()
                      : undefined,
        });

        if (!updated) return { error: new Error('Failed to update news') };

        return {};
    }
}
