import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetUserDetailUseCase } from '../../usecase/get-user-detail.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class GetUserDetailController {
    constructor(
        private readonly useCase: GetUserDetailUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { id } = request.params;
        const result = await this.useCase.execute(id);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send(result.user);
    }
}
