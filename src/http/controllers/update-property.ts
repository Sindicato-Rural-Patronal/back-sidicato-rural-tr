import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdatePropertyUseCase } from '../../usecase/update-property.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class UpdatePropertyController {
    constructor(
        private readonly useCase: UpdatePropertyUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
Params: {
 id: string;
propertyId: string 
};
}>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { id, propertyId } = request.params;
        const result = await this.useCase.execute(propertyId, { userDataId: id }, request.body);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.send(result.property);
    }
}
