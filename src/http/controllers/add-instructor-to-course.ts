import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AddInstructorToCourseUseCase } from '../../usecase/add-instructor-to-course.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Body = { instructorUserDataId: string; title?: string; category?: string };

export class AddInstructorToCourseController {
    constructor(
        private readonly useCase: AddInstructorToCourseUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { courseId: string }; Body: Body }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;

        const { courseId } = request.params;
        const { instructorUserDataId, title, category } = request.body;
        const result = await this.useCase.execute({ courseId, instructorUserDataId, title, category });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(201).send({ assignmentId: result.assignmentId });
    }
}
