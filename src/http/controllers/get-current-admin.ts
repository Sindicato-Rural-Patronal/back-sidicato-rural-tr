import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetCurrentAdminUseCase } from '../../usecase/get-current-admin.js';
import { adminOf } from '../lib/route-auth.js';

export class GetCurrentAdminController {
    constructor(private readonly useCase: GetCurrentAdminUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const result = await this.useCase.execute(adminOf(request).id);
        if (result.error) return reply.status(400).send({ error: result.error?.message });
        return reply.status(200).send(result.data);
    }
}
