import { z } from 'zod';
import type { NewsRepository } from '../ports/external/news-repository.js';
import { ValidationError } from '../errors/validation.js';

const createNewsRequestSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    content: z.string().min(1, 'Content is required'),
    summary: z.string().optional(),
    status: z.enum(['PUBLISHED', 'UNPUBLISHED'] as const).default('UNPUBLISHED'),
    publishedAt: z.iso.datetime().optional(),
    // Agendamento: hora "de parede" de Brasília com Z. Só vale com status PUBLISHED.
    publishAt: z.iso.datetime().nullable().optional(),
});

type CreateNewsRequest = z.input<typeof createNewsRequestSchema>;
type CreateNewsResponse = {
    error?: Error;
    newsId?: string;
};

export class CreateNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(request: CreateNewsRequest): Promise<CreateNewsResponse> {
        const validation = createNewsRequestSchema.safeParse(request);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const { title, content, summary, status, publishedAt } = validation.data;
        // Rascunho não tem agendamento.
        const publishAt =
            status === 'PUBLISHED' && validation.data.publishAt
                ? new Date(validation.data.publishAt)
                : null;

        const news = await this.newsRepository.create({
            title,
            content,
            summary,
            status,
            // Agendada: a data mostrada ao leitor é a que ela entra no ar.
            publishedAt: publishedAt
                ? new Date(publishedAt)
                : (publishAt ?? (status === 'PUBLISHED' ? new Date() : undefined)),
            publishAt,
        });

        return { newsId: news.id };
    }
}
