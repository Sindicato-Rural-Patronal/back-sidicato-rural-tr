import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListRulesUseCase } from '../../usecase/list-rules.js';

export class ListRulesController {
    constructor(
        private readonly useCase: ListRulesUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const response = await this.useCase.execute(page, limit);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.result);
    }
}
