import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { DeleteBannerUseCase } from '../../usecase/delete-banner.js';

export class DeleteBannerController {
    constructor(private readonly useCase: DeleteBannerUseCase) {}

    async handle(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const response = await this.useCase.execute(req.params.id);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(204).send();
    }
}
