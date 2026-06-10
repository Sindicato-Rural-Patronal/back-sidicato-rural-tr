import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteCourseUseCase } from '../../usecase/delete-course.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class DeleteCourseController {
    constructor(
        private readonly useCase: DeleteCourseUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'DELETE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const { courseId } = request.params;
        const response = await this.useCase.execute(courseId);
        if (response.error) {
            const status = response.error?.message.includes('not found') ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
