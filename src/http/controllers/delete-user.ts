import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteUserDataUseCase } from '../../usecase/delete-user-data.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorToStatus, requirePermission } from '../lib/require-permission.js';

export class DeleteUserController {
    constructor(
        private readonly useCase: DeleteUserDataUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const actorId = await requirePermission(request, reply, 'DELETE_USER', this.getAdminPermissions);
        if (actorId === null) return;
        const permissions = (await this.getAdminPermissions.execute(actorId)) ?? [];
        const { id } = request.params;
        const result = await this.useCase.execute(id, { id: actorId,
permissions });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
