import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListUserAdminsUseCase } from '../../usecase/list-user-admins.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class ListUserAdminsController {
    constructor(
        private readonly useCase: ListUserAdminsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(
                request,
                reply,
                'READ_USER_ADMIN',
                this.getAdminPermissions,
            )) === null
        )
            return;
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const isPublic = q.isPublic === 'true' ? true : q.isPublic === 'false' ? false : undefined;
        const filters = { search: q.search || undefined, rulesId: q.rulesId || undefined, isPublic };
        const response = await this.useCase.execute(page, limit, filters);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.result);
    }
}
