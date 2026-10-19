import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DemoteInstructorUseCase } from '../../usecase/demote-instructor.js';
import { errorToStatus } from '../lib/require-permission.js';

export class DemoteInstructorController {
    constructor(
        private readonly useCase: DemoteInstructorUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply,
    ) {
        const { id } = request.params;
        const result = await this.useCase.execute(id);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
