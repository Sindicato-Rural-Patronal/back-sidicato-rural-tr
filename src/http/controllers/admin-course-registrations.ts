import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
    AdminRegisterPersonUseCase,
    ConfirmAllRegistrationsUseCase,
} from '../../usecase/admin-course-registrations.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Params = { courseId: string };

export class AdminRegisterPersonController {
    constructor(
        private readonly useCase: AdminRegisterPersonUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: Params;
            Body: { userDataId: string };
        }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) === null
        )
            return;
        const response = await this.useCase.execute({
            courseId: request.params.courseId,
            userDataId: request.body?.userDataId,
        });
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(201).send({ registrationId: response.registrationId });
    }
}

export class ConfirmAllRegistrationsController {
    constructor(
        private readonly useCase: ConfirmAllRegistrationsUseCase,
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
        return reply.status(200).send({ confirmed: response.confirmed });
    }
}
