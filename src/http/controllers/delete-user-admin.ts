import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteUserAdminUseCase } from '../../usecase/delete-user-admin.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';

export class DeleteUserAdminController {
    constructor(
        private readonly useCase: DeleteUserAdminUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const actorId = adminOf(request).id;
        const actorPerms = [...adminOf(request).permissions];
        const { id } = request.params;
        const result = await this.useCase.execute(id, actorId, actorPerms);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error?.message });
        }
        return reply.status(204).send();
    }
}
