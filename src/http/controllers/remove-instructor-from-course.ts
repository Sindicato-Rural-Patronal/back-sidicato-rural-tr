import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RemoveInstructorFromCourseUseCase } from '../../usecase/remove-instructor-from-course.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class RemoveInstructorFromCourseController {
    constructor(
        private readonly useCase: RemoveInstructorFromCourseUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { courseId: string; assignmentId: string } }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;

        const { assignmentId } = request.params;
        const result = await this.useCase.execute(assignmentId);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
