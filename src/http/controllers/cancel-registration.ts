import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CancelRegistrationUseCase } from '../../usecase/cancel-registration.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

type Params = { registrationId: string };

export class CancelRegistrationController {
    constructor(
        private readonly useCase: CancelRegistrationUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const response = await this.useCase.execute(request.params.registrationId);
        if (response.error) {
            const status = response.error?.message === 'Registration not found' ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
