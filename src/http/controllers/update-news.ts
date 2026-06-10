import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateNewsUseCase } from '../../usecase/update-news.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type UpdateNewsBody = {
    title?: string;
    content?: string;
    summary?: string | null;
    status?: 'PUBLICADO' | 'NAO_PUBLICADO';
    publishedAt?: string | null;
};

export class UpdateNewsController {
    constructor(
        private readonly updateNewsUseCase: UpdateNewsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'UPDATE_NEWS', this.getAdminPermissions)) ===
            null
        )
            return;
        const { newsId } = request.params;
        const body = request.body as UpdateNewsBody;
        const response = await this.updateNewsUseCase.execute({ newsId,
...body });
        if (response.error) {
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error?.message });
        }
        return reply.status(200).send({ message: 'News updated successfully' });
    }
}
