import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UploadAvatarUseCase } from '../../usecase/upload-avatar.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class UploadAvatarController {
    constructor(
        private readonly uploadAvatarUseCase: UploadAvatarUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) === null) return;
        const { id } = request.params;
        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'No file uploaded' });
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        const fileBuffer = Buffer.concat(chunks);

        const response = await this.uploadAvatarUseCase.execute({
            userId: id,
            file: fileBuffer,
            mimeType: data.mimetype,
            originalName: data.filename,
        });
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ avatarUrl: response.avatarUrl });
    }
}
