import { z } from 'zod';
import type { NewsRepository } from '../ports/external/news-repository.js';
import { ValidationError } from '../errors/validation.js';
import { NewsNotFoundError } from '../errors/not-found.js';
import { isScheduled, nowWallClock } from './news-visibility.js';

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

        // O status que vale é o que a notícia terá depois do pedido: um PATCH sem
        // `status` num rascunho também não guarda agendamento.
        const status = updateData.status ?? existing.status;
        // Rascunho nunca guarda agendamento (voltar para rascunho o descarta).
        const nextPublishAt =
            status === 'UNPUBLISHED'
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
                    : nextPublishedAt(status, nextPublishAt, existing),
        });

        if (!updated) return { error: new Error('Failed to update news') };

        return {};
    }
}

/**
 * Data mostrada ao leitor quando o pedido não a manda. Hora "de parede" de
 * Brasília com Z, a mesma convenção do `publishAt` (antes o "agora" era o
 * instante real em UTC e a data saía errada perto da meia-noite).
 * - Agendada: a data é a do agendamento.
 * - Entrando no ar agora: hoje, se ainda não tinha data ou se a que tinha era
 *   de um agendamento que não chegou ("publicar agora" uma agendada).
 * - Senão (já estava no ar, ou continua agendada/rascunho): não mexe.
 */
function nextPublishedAt(
    status: 'PUBLISHED' | 'UNPUBLISHED',
    nextPublishAt: Date | null | undefined,
    existing: {
 publishAt: Date | null;
publishedAt: Date | null 
},
): Date | undefined {
    if (nextPublishAt) return nextPublishAt;
    if (status !== 'PUBLISHED') return undefined;
    const now = nowWallClock();
    const publishAt = nextPublishAt === undefined ? existing.publishAt : nextPublishAt;
    if (isScheduled(publishAt, now)) return undefined;
    if (!existing.publishedAt || existing.publishedAt.getTime() > now.getTime()) return now;
    return undefined;
}
