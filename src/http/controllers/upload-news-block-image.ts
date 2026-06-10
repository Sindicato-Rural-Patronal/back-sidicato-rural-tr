import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UploadNewsBlockImageUseCase } from '../../usecase/upload-news-block-image.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class UploadNewsBlockImageController {
    constructor(
        private readonly useCase: UploadNewsBlockImageUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'UPDATE_NEWS', this.getAdminPermissions)) ===
            null
        )
            return;
        const { newsId } = request.params;
        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'No file provided' });
        const buffer = await data.toBuffer();
        const response = await this.useCase.execute(newsId, buffer, data.mimetype);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send({ url: response.url });
    }
}
