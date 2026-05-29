import { FastifyRequest, FastifyReply } from 'fastify';
import { DeleteNewsUseCase } from '../../usecase/delete-news.js';

export class DeleteNewsController {
    constructor(private deleteNewsUseCase: DeleteNewsUseCase) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        const token = (request.headers.authorization ?? '').replace('Bearer ', '');
        const { newsId } = request.params;

        const response = await this.deleteNewsUseCase.execute(newsId, token);
        if (!response.success) {
            const fallback = response.error?.message?.includes('not found') ? 404 : 400;
            return reply.status(response.statusCode ?? fallback).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
