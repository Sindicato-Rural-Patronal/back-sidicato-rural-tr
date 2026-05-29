import { FastifyRequest, FastifyReply } from 'fastify';
import { ListNewsUseCase } from '../../usecase/list-news.js';

export class ListNewsController {
    constructor(private listNewsUseCase: ListNewsUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const response = await this.listNewsUseCase.execute('PUBLICADO');
        return reply.status(200).send(response.news);
    }
}
