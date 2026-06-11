import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateNewsUseCase } from '../../usecase/create-news.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

type CreateNewsBody = {
    title: string;
    content: string;
    summary?: string;
    status?: 'PUBLISHED' | 'UNPUBLISHED';
    publishedAt?: string;
};

export class CreateNewsController {
    constructor(
        private readonly createNewsUseCase: CreateNewsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'CREATE_NEWS', this.getAdminPermissions)) ===
            null
        )
            return;
        const body = request.body as CreateNewsBody;
        const response = await this.createNewsUseCase.execute({
            ...body,
            status: body.status ?? 'UNPUBLISHED',
        });
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(201).send({ id: response.newsId });
    }
}
