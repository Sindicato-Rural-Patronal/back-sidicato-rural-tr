import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateNewsUseCase } from '../../usecase/create-news.js';

type CreateNewsBody = {
    title: string;
    content: string;
    summary?: string;
    status?: 'PUBLICADO' | 'NAO_PUBLICADO';
    publishedAt?: string;
};

export class CreateNewsController {
    constructor(private createNewsUseCase: CreateNewsUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = (request.headers.authorization ?? '').replace('Bearer ', '');
        const body = request.body as CreateNewsBody;
        const response = await this.createNewsUseCase.execute(
            { ...body, status: body.status ?? 'NAO_PUBLICADO' },
            token,
        );
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(201).send({ id: response.newsId });
    }
}
