import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteUserRelationUseCase } from '../../usecase/delete-user-relation.js';
import { errorToStatus } from '../lib/require-permission.js';

export class DeleteUserRelationController {
    constructor(
        private readonly useCase: DeleteUserRelationUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: {
                id: string;
                relationId: string;
            };
        }>,
        reply: FastifyReply,
    ) {
        const { id: userId, relationId } = request.params;
        const result = await this.useCase.execute(relationId, userId);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
