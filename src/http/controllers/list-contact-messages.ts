import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListContactMessagesUseCase } from '../../usecase/list-contact-messages.js';

type Querystring = { page?: number; limit?: number; read?: boolean; search?: string };

export class ListContactMessagesController {
    constructor(private readonly useCase: ListContactMessagesUseCase) {}

    async handle(req: FastifyRequest<{ Querystring: Querystring }>, reply: FastifyReply) {
        const { page, limit, read, search } = req.query;
        const response = await this.useCase.execute({ page, limit, read, search });
        return reply.status(200).send(response);
    }
}
