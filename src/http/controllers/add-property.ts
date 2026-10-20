import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AddPropertyUseCase, AddPropertyRequest } from '../../usecase/add-property.js';
import { errorToStatus } from '../lib/require-permission.js';

type Body = Omit<AddPropertyRequest, 'userDataId'>;

export class AddPropertyController {
    constructor(
        private readonly useCase: AddPropertyUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { id: string };
            Body: Body;
        }>,
        reply: FastifyReply,
    ) {
        const { id } = request.params;
        const body = request.body;
        const result = await this.useCase.execute({ userDataId: id,
...body });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(201).send({ id: result.property?.id });
    }
}
