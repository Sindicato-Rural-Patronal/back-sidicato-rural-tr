import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateNewsUseCase } from '../../usecase/update-news.js';
import { errorToStatus } from '../lib/require-permission.js';

type UpdateNewsBody = {
    title?: string;
    content?: string;
    summary?: string | null;
    status?: 'PUBLISHED' | 'UNPUBLISHED';
    publishedAt?: string | null;
};

export class UpdateNewsController {
    constructor(
        private readonly updateNewsUseCase: UpdateNewsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        const { newsId } = request.params;
        const body = request.body as UpdateNewsBody;
        const response = await this.updateNewsUseCase.execute({ newsId,
...body });
        if (response.error) {
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error?.message });
        }
        return reply.status(200).send({ message: 'News updated successfully' });
    }
}
