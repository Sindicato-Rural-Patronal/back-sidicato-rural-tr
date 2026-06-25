import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListNewsUseCase } from '../../usecase/list-news.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class ListAllNewsController {
    constructor(
        private readonly listNewsUseCase: ListNewsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_NEWS', this.getAdminPermissions)) ===
            null
        )
            return;
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const status = (q.status as 'PUBLISHED' | 'UNPUBLISHED') || undefined;
        const response = await this.listNewsUseCase.execute(status, page, limit);
        return reply.status(200).send(response.result);
    }
}
