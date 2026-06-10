import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AddCoursePhotoUseCase } from '../../usecase/add-course-photo.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class AddCoursePhotoController {
    constructor(
        private readonly useCase: AddCoursePhotoUseCase,
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

        const captionField = (data.fields as Record<string, { value?: string } | undefined>)
            ?.caption;
        const caption = captionField?.value;
        const response = await this.useCase.execute(courseId, fileBuffer, data.filename, caption);

        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(201).send({ url: response.url,
photoId: response.photoId });
    }
}
