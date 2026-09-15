import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateMeUseCase } from '../../usecase/update-me.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requireAuth, errorToStatus } from '../lib/require-permission.js';

export class UpdateMeController {
    constructor(
        private readonly updateMeUseCase: UpdateMeUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const adminId = await requireAuth(request, reply, this.getAdminPermissions);
        if (adminId === null) return;
        const r = await this.updateMeUseCase.execute(adminId, request.body);
        if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
        return reply.status(200).send({ message: 'ok' });
    }
}
