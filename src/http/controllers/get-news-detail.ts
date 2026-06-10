import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetNewsDetailUseCase } from '../../usecase/get-news-detail.js';

export class GetNewsDetailController {
    constructor(private getNewsDetailUseCase: GetNewsDetailUseCase) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        const { newsId } = request.params;
        const response = await this.getNewsDetailUseCase.execute(newsId);
        if (response.error) return reply.status(404).send({ error: response.error?.message });
        return reply.status(200).send(response.news);
    }
}
