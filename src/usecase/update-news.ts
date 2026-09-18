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
    // Agendamento: hora "de parede" de Brasília com Z; null = publicar agora.
    publishAt: z.iso.datetime().optional().nullable(),
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

        const { newsId, publishedAt, publishAt, ...updateData } = validation.data;

        const existing = await this.newsRepository.findById(newsId);
        if (!existing) return { error: new NewsNotFoundError() };

        // Voltar para rascunho descarta o agendamento.
        const nextPublishAt =
            updateData.status === 'UNPUBLISHED'
                ? null
                : publishAt !== undefined
                  ? publishAt
                      ? new Date(publishAt)
                      : null
                  : undefined;

        const updated = await this.newsRepository.update(newsId, {
            ...updateData,
            publishAt: nextPublishAt,
            publishedAt:
                publishedAt !== undefined
                    ? publishedAt
                        ? new Date(publishedAt)
                        : null
                    : // Agendada: a data mostrada ao leitor é a que ela entra no ar.
                      (nextPublishAt ??
                      (updateData.status === 'PUBLISHED' && !existing.publishedAt
                          ? new Date()
                          : undefined)),
        });

        if (!updated) return { error: new Error('Failed to update news') };

        return {};
    }
}
