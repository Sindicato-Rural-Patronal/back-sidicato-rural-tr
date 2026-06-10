import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateUserDataUseCase } from '../../usecase/update-user-data.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class UpdateUserController {
    constructor(
        private readonly useCase: UpdateUserDataUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { id: string };
            Body: {
                name?: string;
                email?: string;
                phone?: string;
                cpf?: string | null;
                cnpj?: string | null;
            };
        }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) ===
            null
        )
            return;
        const { id } = request.params;
        const body = request.body;
        const result = await this.useCase.execute({ ...body,
userId: id });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error?.message });
        }
        return reply.status(200).send({ message: 'User updated successfully' });
    }
}
