import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteNewsUseCase } from '../../usecase/delete-news.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class DeleteNewsController {
    constructor(
        private readonly deleteNewsUseCase: DeleteNewsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'DELETE_NEWS', this.getAdminPermissions)) ===
            null
        )
            return;
        const { newsId } = request.params;
        const response = await this.deleteNewsUseCase.execute(newsId);
        if (response.error) {
            const status = response.error?.message?.includes('not found') ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
