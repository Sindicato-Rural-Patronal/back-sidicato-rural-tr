import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteUserDataUseCase } from '../../usecase/delete-user-data.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class DeleteUserController {
    constructor(
        private readonly useCase: DeleteUserDataUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'DELETE_USER', this.getAdminPermissions)) ===
            null
        )
            return;
        const { id } = request.params;
        const result = await this.useCase.execute(id);
        if (result.error) {
            const status = result.error?.message === 'User not found' ? 404 : 400;
            return reply.status(status).send({ error: result.error?.message });
        }
        return reply.status(204).send();
    }
}
