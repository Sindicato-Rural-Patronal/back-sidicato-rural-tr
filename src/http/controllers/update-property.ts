import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdatePropertyUseCase } from '../../usecase/update-property.js';
import { errorToStatus } from '../lib/require-permission.js';

export class UpdatePropertyController {
    constructor(
        private readonly useCase: UpdatePropertyUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
Params: {
 id: string;
propertyId: string 
};
}>,
        reply: FastifyReply,
    ) {
        const { id, propertyId } = request.params;
        const result = await this.useCase.execute(propertyId, { userDataId: id }, request.body);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.send(result.property);
    }
}
