import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteNewsUseCase } from '../../usecase/delete-news.js';

export class DeleteNewsController {
    constructor(
        private readonly deleteNewsUseCase: DeleteNewsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        const { newsId } = request.params;
        const response = await this.deleteNewsUseCase.execute(newsId);
        if (response.error) {
            const status = response.error?.message?.includes('not found') ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
