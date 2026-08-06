import type { FastifyRequest, FastifyReply } from 'fastify';
import type { StartCourseUseCase } from '../../usecase/start-course.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Params = { courseId: string };

export class StartCourseController {
    constructor(
        private readonly useCase: StartCourseUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) === null
        )
            return;
        const response = await this.useCase.execute(request.params.courseId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'ok' });
    }
}
