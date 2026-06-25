import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListPartnersUseCase } from '../../usecase/list-partners.js';

export class ListPartnersController {
    constructor(private readonly useCase: ListPartnersUseCase) {}

    async handle(_req: FastifyRequest, reply: FastifyReply) {
        const response = await this.useCase.execute();
        return reply.status(200).send(response.partners);
    }
}
