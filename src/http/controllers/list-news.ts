import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListNewsUseCase } from '../../usecase/list-news.js';
import { nowWallClock, publicNewsFilters } from '../../usecase/news-visibility.js';

export class ListNewsController {
    constructor(private listNewsUseCase: ListNewsUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        // Notícia agendada para depois fica de fora até a hora chegar.
        const response = await this.listNewsUseCase.execute(
            publicNewsFilters(nowWallClock()),
            page,
            limit,
        );
        return reply.status(200).send(response.result);
    }
}
