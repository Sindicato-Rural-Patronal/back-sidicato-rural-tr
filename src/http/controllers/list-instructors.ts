import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListInstructorsUseCase } from '../../usecase/list-instructors.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Query = { page?: number; limit?: number };

export class ListInstructorsController {
    constructor(
        private readonly useCase: ListInstructorsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Querystring: Query }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { page = 1, limit = 20 } = request.query;
        const result = await this.useCase.execute(page, limit);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send({
            data: result.data,
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
        });
    }
}
