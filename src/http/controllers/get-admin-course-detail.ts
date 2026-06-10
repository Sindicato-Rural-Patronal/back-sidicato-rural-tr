import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetAdminCourseDetailUseCase } from '../../usecase/get-admin-course-detail.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

export class GetAdminCourseDetailController {
    constructor(
        private readonly useCase: GetAdminCourseDetailUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const { courseId } = request.params;
        const response = await this.useCase.execute(courseId);
        if (response.error) {
            const status = response.error?.message === 'Course not found' ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(200).send(response.course);
    }
}
