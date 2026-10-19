import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateMeUseCase } from '../../usecase/update-me.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';

export class UpdateMeController {
    constructor(private readonly updateMeUseCase: UpdateMeUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const r = await this.updateMeUseCase.execute(adminOf(request).id, request.body);
        if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
        return reply.status(200).send({ message: 'ok' });
    }
}
