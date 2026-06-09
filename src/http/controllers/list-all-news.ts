import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListNewsUseCase } from '../../usecase/list-news.js';
import { verifyPermission } from '../../lib/verify-permission.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

export class ListAllNewsController {
    constructor(
        private listNewsUseCase: ListNewsUseCase,
        private userAdminRepository: UserAdminRepository,
        private ruleRepository: RuleRepository,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = (request.headers.authorization ?? '').replace('Bearer ', '');
        const { authorized, statusCode, error: permError } = await verifyPermission(token, 'READ_NEWS', this.userAdminRepository, this.ruleRepository);
        if (!authorized) return reply.status(statusCode).send({ error: permError });

        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const response = await this.listNewsUseCase.execute(undefined, page, limit);
        return reply.status(200).send(response.result);
    }
}
