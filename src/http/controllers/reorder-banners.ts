import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { ReorderBannersUseCase } from '../../usecase/reorder-banners.js';

export class ReorderBannersController {
    constructor(private readonly useCase: ReorderBannersUseCase) {}

    async handle(req: FastifyRequest, reply: FastifyReply) {
        const response = await this.useCase.execute(req.body as { order: string[] });
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'Reordered' });
    }
}
