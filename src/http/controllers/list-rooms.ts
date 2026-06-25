import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListRoomsUseCase } from '../../usecase/list-rooms.js';

type Query = {
 page?: number;
limit?: number 
};

export class ListRoomsController {
    constructor(private readonly useCase: ListRoomsUseCase) {}

    async handle(request: FastifyRequest<{ Querystring: Query }>, reply: FastifyReply) {
        const { page = 1, limit = 20 } = request.query;
        const response = await this.useCase.execute(page, limit);
        return reply.status(200).send({
            data: response.data,
            total: response.total,
            page: response.page,
            limit: response.limit,
            totalPages: response.totalPages,
        });
    }
}
