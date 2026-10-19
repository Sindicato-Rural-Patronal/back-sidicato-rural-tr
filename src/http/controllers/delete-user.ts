import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteUserDataUseCase } from '../../usecase/delete-user-data.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';

export class DeleteUserController {
    constructor(
        private readonly useCase: DeleteUserDataUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const admin = adminOf(request);
        const { id } = request.params;
        const result = await this.useCase.execute(id, { id: admin.id,
permissions: [...admin.permissions] });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
