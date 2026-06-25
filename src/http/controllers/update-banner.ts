import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { UpdateBannerUseCase } from '../../usecase/update-banner.js';

export class UpdateBannerController {
    constructor(private readonly useCase: UpdateBannerUseCase) {}

    async handle(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const response = await this.useCase.execute(req.params.id, req.body as Record<string, unknown>);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send(response.banner);
    }
}
