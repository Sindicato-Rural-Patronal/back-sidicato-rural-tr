import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AddUserRelationUseCase } from '../../usecase/add-user-relation.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Body = {
 targetId: string;
label?: string 
};

export class AddUserRelationController {
    constructor(
        private readonly useCase: AddUserRelationUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
 Params: { id: string };
Body: Body 
}>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { id } = request.params;
        const { targetId, label } = request.body;
        const result = await this.useCase.execute(id, targetId, label);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(201).send({ id: result.relation?.id });
    }
}
