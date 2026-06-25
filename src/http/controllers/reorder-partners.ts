import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { ReorderPartnersUseCase } from '../../usecase/reorder-partners.js';

export class ReorderPartnersController {
    constructor(private readonly useCase: ReorderPartnersUseCase) {}

    async handle(req: FastifyRequest, reply: FastifyReply) {
        const response = await this.useCase.execute(req.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'Reordered' });
    }
}
