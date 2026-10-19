import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
    SetRegistrationAttendanceUseCase,
    SetUnmarkedAttendanceUseCase,
} from '../../usecase/course-attendance.js';
import { errorToStatus } from '../lib/require-permission.js';

export class SetRegistrationAttendanceController {
    constructor(
        private readonly useCase: SetRegistrationAttendanceUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { registrationId: string };
            Body: { attended: boolean | null };
        }>,
        reply: FastifyReply,
    ) {
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
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { courseId: string };
            Body: { attended: boolean };
        }>,
        reply: FastifyReply,
    ) {
        const response = await this.useCase.execute(request.params.courseId, request.body?.attended);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ updated: response.updated });
    }
}
