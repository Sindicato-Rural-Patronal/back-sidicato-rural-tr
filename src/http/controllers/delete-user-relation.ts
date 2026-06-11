import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteUserRelationUseCase } from '../../usecase/delete-user-relation.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class DeleteUserRelationController {
    constructor(
        private readonly useCase: DeleteUserRelationUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
 Params: {
 id: string;
relationId: string 
} 
}>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { relationId } = request.params;
        const result = await this.useCase.execute(relationId);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
