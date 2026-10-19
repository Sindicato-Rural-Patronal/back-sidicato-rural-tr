import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DashboardStatsUseCase } from '../../usecase/dashboard-stats.js';
import { adminOf } from '../lib/route-auth.js';

export class DashboardStatsController {
    constructor(private readonly useCase: DashboardStatsUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        // Qualquer admin logado: as permissões dele decidem quais blocos vêm na
        // resposta (o que ele não pode ver é omitido, não dá 403).
        const response = await this.useCase.execute([...adminOf(request).permissions]);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.stats);
    }
}
