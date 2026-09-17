import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
    SetRegistrationAttendanceUseCase,
    SetUnmarkedAttendanceUseCase,
} from '../../usecase/course-attendance.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class SetRegistrationAttendanceController {
    constructor(
        private readonly useCase: SetRegistrationAttendanceUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { registrationId: string };
            Body: { attended: boolean | null };
        }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) === null
        )
            return;
        const response = await this.useCase.execute(request.params.registrationId, request.body?.attended);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send(response.registration);
    }
}

export class SetUnmarkedAttendanceController {
    constructor(
        private readonly useCase: SetUnmarkedAttendanceUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { courseId: string };
            Body: { attended: boolean };
        }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) === null
        )
            return;
        const response = await this.useCase.execute(request.params.courseId, request.body?.attended);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ updated: response.updated });
    }
}
