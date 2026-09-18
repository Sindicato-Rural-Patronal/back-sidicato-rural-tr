import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DashboardStatsUseCase } from '../../usecase/dashboard-stats.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { decodeToken } from '../../lib/auth.js';

export class DashboardStatsController {
    constructor(
        private readonly useCase: DashboardStatsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        // Qualquer admin logado: as permissões dele decidem quais blocos vêm na
        // resposta (o que ele não pode ver é omitido, não dá 403).
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const decoded = decodeToken(token);
        if (!decoded) return reply.status(401).send({ error: 'Unauthorized' });
        const permissions = await this.getAdminPermissions.execute(decoded.userId);
        if (!permissions) return reply.status(401).send({ error: 'Admin not found' });

        const response = await this.useCase.execute(permissions);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.stats);
    }
}
