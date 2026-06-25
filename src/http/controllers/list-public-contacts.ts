import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListPublicContactsUseCase } from '../../usecase/list-public-contacts.js';

export class ListPublicContactsController {
    constructor(private readonly useCase: ListPublicContactsUseCase) {}

    async handle(_req: FastifyRequest, reply: FastifyReply) {
        const response = await this.useCase.execute();
        return reply.status(200).send(response.contacts);
    }
}
