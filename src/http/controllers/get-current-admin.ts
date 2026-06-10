import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetCurrentAdminUseCase } from '../../usecase/get-current-admin.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requireAuth } from '../lib/require-permission.js';

export class GetCurrentAdminController {
    constructor(
        private readonly useCase: GetCurrentAdminUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const userId = await requireAuth(request, reply, this.getAdminPermissions);
        if (userId === null) return;
        const result = await this.useCase.execute(userId);
        if (result.error) return reply.status(400).send({ error: result.error?.message });
        return reply.status(200).send(result.data);
    }
}
