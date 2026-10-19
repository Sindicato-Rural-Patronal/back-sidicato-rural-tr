import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AddUserRelationUseCase } from '../../usecase/add-user-relation.js';
import { errorToStatus } from '../lib/require-permission.js';

type Body = {
    targetId: string;
    label?: string;
};

export class AddUserRelationController {
    constructor(
        private readonly useCase: AddUserRelationUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { id: string };
            Body: Body;
        }>,
        reply: FastifyReply,
    ) {
        const { id } = request.params;
        const { targetId, label } = request.body;
        const result = await this.useCase.execute(id, targetId, label);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(201).send({ id: result.relation?.id });
    }
}
