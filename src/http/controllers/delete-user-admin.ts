import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteUserAdminUseCase } from '../../usecase/delete-user-admin.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class DeleteUserAdminController {
    constructor(
        private readonly useCase: DeleteUserAdminUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const actorId = await requirePermission(
            request,
            reply,
            'DELETE_USER_ADMIN',
            this.getAdminPermissions,
        );
        if (actorId === null) return;
        const actorPerms = (await this.getAdminPermissions.execute(actorId)) ?? [];
        const { id } = request.params;
        const result = await this.useCase.execute(id, actorId, actorPerms);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error?.message });
        }
        return reply.status(204).send();
    }
}
