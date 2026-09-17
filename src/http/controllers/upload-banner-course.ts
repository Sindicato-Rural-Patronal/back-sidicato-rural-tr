import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UploadCourseBannerUseCase } from '../../usecase/upload-banner-course.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class UploadBannerCourseController {
    constructor(
        private readonly uploadBannerUseCase: UploadCourseBannerUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const { courseId } = request.params;
        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'No file uploaded' });
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        const fileBuffer = Buffer.concat(chunks);
        if (data.file.truncated) return reply.status(400).send({ error: 'Arquivo excede o limite permitido.' });
        const response = await this.uploadBannerUseCase.execute(courseId, fileBuffer, data.mimetype);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ url: response.url,
thumbUrl: response.thumbUrl ?? null });
    }
}
