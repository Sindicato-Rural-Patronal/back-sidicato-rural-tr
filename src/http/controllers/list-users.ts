import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListUsersUseCase } from '../../usecase/list-users.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class ListUsersController {
    constructor(
        private readonly useCase: ListUsersUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_USER', this.getAdminPermissions)) ===
            null
        )
            return;
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const incompleteRegistration =
            q.incompleteRegistration === 'true' ? true :
            q.incompleteRegistration === 'false' ? false : undefined;
        const filters = {
            search: q.search || undefined,
            memberType: q.memberType || undefined,
            memberClassification: q.memberClassification || undefined,
            gender: q.gender || undefined,
            ethnicity: q.ethnicity || undefined,
            educationLevel: q.educationLevel || undefined,
            incompleteRegistration,
        };
        const response = await this.useCase.execute(page, limit, filters);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.result);
    }
}
