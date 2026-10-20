import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateNewsUseCase } from '../../usecase/create-news.js';

type CreateNewsBody = {
    title: string;
    content: string;
    summary?: string;
    status?: 'PUBLISHED' | 'UNPUBLISHED';
    publishedAt?: string;
};

export class CreateNewsController {
    constructor(
        private readonly createNewsUseCase: CreateNewsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as CreateNewsBody;
        const response = await this.createNewsUseCase.execute({
            ...body,
            status: body.status ?? 'UNPUBLISHED',
        });
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(201).send({ id: response.newsId });
    }
}
