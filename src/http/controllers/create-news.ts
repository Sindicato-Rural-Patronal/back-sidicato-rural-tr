import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateNewsUseCase } from '../../usecase/create-news.js';
import { verifyPermission } from '../../lib/verify-permission.js';
import { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import { RuleRepository } from '../../ports/external/rule-repository.js';

type CreateNewsBody = {
    title: string;
    content: string;
    summary?: string;
    status?: 'PUBLICADO' | 'NAO_PUBLICADO';
    publishedAt?: string;
};

export class CreateNewsController {
    constructor(
        private createNewsUseCase: CreateNewsUseCase,
        private userAdminRepository: UserAdminRepository,
        private ruleRepository: RuleRepository,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = (request.headers.authorization ?? '').replace('Bearer ', '');
        const { authorized, statusCode, error: permError } = await verifyPermission(token, 'CREATE_NEWS', this.userAdminRepository, this.ruleRepository);
        if (!authorized) return reply.status(statusCode).send({ error: permError });

        const body = request.body as CreateNewsBody;
        const response = await this.createNewsUseCase.execute({
            ...body,
            status: body.status ?? 'NAO_PUBLICADO',
        });
        if (!response.success) {
            return reply.status(400).send({ error: response.error?.message });
        }
        return reply.status(201).send({ id: response.newsId });
    }
}
