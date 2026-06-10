import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateCourseUseCase, UpdateCourseRequest } from '../../usecase/update-course.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class UpdateCourseController {
    constructor(
        private readonly useCase: UpdateCourseUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const { courseId } = request.params;
        const body = request.body as Record<string, unknown>;
        const response = await this.useCase.execute({ ...body,
courseId } as UpdateCourseRequest);
        if (response.error)
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error?.message });
        return reply.status(200).send({ message: 'Course updated successfully' });
    }
}
