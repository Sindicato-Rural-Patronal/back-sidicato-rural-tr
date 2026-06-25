import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListUserRelationsUseCase } from '../../usecase/list-user-relations.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class ListUserRelationsController {
    constructor(
        private readonly useCase: ListUserRelationsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { id: string };
            Querystring: { page?: number; limit?: number };
        }>,
        reply: FastifyReply,
    ) {
        if ((await requirePermission(request, reply, 'READ_USER', this.getAdminPermissions)) === null)
            return;

        const { id } = request.params;
        const { page = 1, limit = 20 } = request.query;
        const response = await this.useCase.execute(id, page, limit);
        if (response.error)
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        return reply.status(200).send(response.result);
    }
}
