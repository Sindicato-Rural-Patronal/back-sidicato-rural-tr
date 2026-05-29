import { FastifyRequest, FastifyReply } from 'fastify';
import { UpdateNewsUseCase } from '../../usecase/update-news.js';

type UpdateNewsBody = {
    title?: string;
    content?: string;
    summary?: string | null;
    status?: 'PUBLICADO' | 'NAO_PUBLICADO';
    publishedAt?: string | null;
};

export class UpdateNewsController {
    constructor(private updateNewsUseCase: UpdateNewsUseCase) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        const token = (request.headers.authorization ?? '').replace('Bearer ', '');
        const { newsId } = request.params;
        const body = request.body as UpdateNewsBody;

        const response = await this.updateNewsUseCase.execute({ newsId, token, ...body });
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(200).send({ message: 'News updated successfully' });
    }
}
