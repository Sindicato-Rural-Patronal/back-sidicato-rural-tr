import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateUserAdminUseCase } from '../../usecase/update-user-admin.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';

export class UpdateUserAdminController {
    constructor(
        private readonly useCase: UpdateUserAdminUseCase,
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
        const actorPerms = [...adminOf(request).permissions];
        const { id } = request.params;
        const body = request.body;
        const result = await this.useCase.execute({ ...body,
targetAdminId: id }, actorPerms);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error?.message });
        }
        return reply.status(200).send({ message: 'Admin updated successfully' });
    }
}
