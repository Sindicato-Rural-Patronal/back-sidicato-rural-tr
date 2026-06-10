import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateUserAdminUseCase } from '../../usecase/update-user-admin.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class UpdateUserAdminController {
    constructor(
        private readonly useCase: UpdateUserAdminUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { id: string };
            Body: {
                username?: string;
                password?: string;
                rulesId?: string;
            };
        }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(
                request,
                reply,
                'UPDATE_USER_ADMIN',
                this.getAdminPermissions,
            )) === null
        )
            return;
        const { id } = request.params;
        const body = request.body;
        const result = await this.useCase.execute({ ...body,
targetAdminId: id });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error?.message });
        }
        return reply.status(200).send({ message: 'Admin updated successfully' });
    }
}
