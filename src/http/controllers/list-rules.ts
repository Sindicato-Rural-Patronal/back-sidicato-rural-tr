import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListRulesUseCase } from '../../usecase/list-rules.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class ListRulesController {
    constructor(
        private readonly useCase: ListRulesUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_RULE', this.getAdminPermissions)) ===
            null
        )
            return;
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const response = await this.useCase.execute(page, limit);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.result);
    }
}
