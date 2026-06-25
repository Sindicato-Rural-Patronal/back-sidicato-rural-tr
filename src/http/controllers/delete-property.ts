import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeletePropertyUseCase } from '../../usecase/delete-property.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class DeletePropertyController {
    constructor(
        private readonly useCase: DeletePropertyUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: {
                id: string;
                propertyId: string;
            };
        }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { id: userId, propertyId } = request.params;
        const result = await this.useCase.execute(propertyId, userId);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
