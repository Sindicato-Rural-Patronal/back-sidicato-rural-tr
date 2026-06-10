import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListCourseRegistrationsUseCase } from '../../usecase/list-course-registrations.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

type Params = { courseId: string };

export class ListCourseRegistrationsController {
    constructor(
        private readonly useCase: ListCourseRegistrationsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const response = await this.useCase.execute(request.params.courseId);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.registrations);
    }
}
