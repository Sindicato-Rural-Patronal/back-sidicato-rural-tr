import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListUserRelationsUseCase } from '../../usecase/list-user-relations.js';
import { errorToStatus } from '../lib/require-permission.js';

export class ListUserRelationsController {
    constructor(
        private readonly useCase: ListUserRelationsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { id: string };
            Querystring: {
 page?: number;
limit?: number 
};
        }>,
        reply: FastifyReply,
    ) {
        const { id } = request.params;
        const { page = 1, limit = 20 } = request.query;
        const response = await this.useCase.execute(id, page, limit);
        if (response.error)
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        return reply.status(200).send(response.result);
    }
}
