import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SetRegistrationConfirmedUseCase } from '../../usecase/set-registration-confirmed.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Params = { registrationId: string };
type Body = { confirmed: boolean };

export class SetRegistrationConfirmedController {
    constructor(
        private readonly useCase: SetRegistrationConfirmedUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{
 Params: Params;
Body: Body 
}>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'UPDATE_COURSE', this.getAdminPermissions)) === null
        )
            return;
        const response = await this.useCase.execute(request.params.registrationId, request.body.confirmed);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'ok' });
    }
}
