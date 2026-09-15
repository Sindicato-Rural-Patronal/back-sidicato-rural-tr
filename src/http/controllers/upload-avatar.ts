import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UploadAvatarUseCase } from '../../usecase/upload-avatar.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import { requirePermission, requireAuth, errorToStatus } from '../lib/require-permission.js';

export class UploadAvatarController {
    constructor(
        private readonly uploadAvatarUseCase: UploadAvatarUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
        private readonly userAdminRepository: UserAdminRepository,
    ) {}

    private async readFile(request: FastifyRequest, reply: FastifyReply): Promise<
        { file: Buffer; mimeType: string; originalName: string } | null
    > {
        const data = await request.file();
        if (!data) { reply.status(400).send({ error: 'No file uploaded' }); return null; }
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        const fileBuffer = Buffer.concat(chunks);
        if (data.file.truncated) { reply.status(400).send({ error: 'Arquivo excede o limite permitido.' }); return null; }
        return { file: fileBuffer, mimeType: data.mimetype, originalName: data.filename };
    }

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) === null) return;
        const parsed = await this.readFile(request, reply);
        if (!parsed) return;

        const response = await this.uploadAvatarUseCase.execute({ userId: request.params.id, ...parsed });
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ avatarUrl: response.avatarUrl });
    }

    // Self-service: o admin logado troca a PRÓPRIA foto (auth-only).
    async handleMe(request: FastifyRequest, reply: FastifyReply) {
        const adminId = await requireAuth(request, reply, this.getAdminPermissions);
        if (adminId === null) return;
        const admin = await this.userAdminRepository.findById(adminId);
        if (!admin) return reply.status(404).send({ error: 'Admin não encontrado' });
        const parsed = await this.readFile(request, reply);
        if (!parsed) return;

        const response = await this.uploadAvatarUseCase.execute({ userId: admin.userDataId, ...parsed });
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ avatarUrl: response.avatarUrl });
    }
}
