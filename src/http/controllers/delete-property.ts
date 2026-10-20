import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeletePropertyUseCase } from '../../usecase/delete-property.js';
import { errorToStatus } from '../lib/require-permission.js';

export class DeletePropertyController {
    constructor(
        private readonly useCase: DeletePropertyUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: {
                id: string;
                propertyId: string;
            };
        }>,
        reply: FastifyReply,
    ) {
        const { id: userId, propertyId } = request.params;
        const result = await this.useCase.execute(propertyId, userId);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
