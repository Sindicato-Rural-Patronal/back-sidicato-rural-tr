import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteCoursePhotoUseCase } from '../../usecase/delete-course-photo.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class DeleteCoursePhotoController {
    constructor(
        private readonly useCase: DeleteCoursePhotoUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: {
                courseId: string;
                photoId: string;
            };
        }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const { photoId } = request.params;
        const response = await this.useCase.execute(photoId);
        if (response.error) {
            const status = response.error?.message.includes('not found') ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
