import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DashboardStatsUseCase } from '../../usecase/dashboard-stats.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class DashboardStatsController {
    constructor(
        private readonly useCase: DashboardStatsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const response = await this.useCase.execute();
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.stats);
    }
}
