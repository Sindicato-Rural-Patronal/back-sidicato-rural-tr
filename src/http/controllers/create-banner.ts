import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { CreateBannerUseCase } from '../../usecase/create-banner.js';

export class CreateBannerController {
    constructor(private readonly useCase: CreateBannerUseCase) {}

    async handle(req: FastifyRequest, reply: FastifyReply) {
        const response = await this.useCase.execute(req.body as Record<string, unknown>);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(201).send(response.banner);
    }
}
