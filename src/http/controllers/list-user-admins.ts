import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListUserAdminsUseCase } from '../../usecase/list-user-admins.js';

export class ListUserAdminsController {
    constructor(
        private readonly useCase: ListUserAdminsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const filters = { search: q.search || undefined,
rulesId: q.rulesId || undefined };
        const response = await this.useCase.execute(page, limit, filters);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.result);
    }
}
