import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteRegistrationFichaUseCase } from '../../usecase/delete-registration-ficha.js';
import { errorToStatus } from '../lib/require-permission.js';

export class DeleteRegistrationFichaController {
    constructor(
        private readonly useCase: DeleteRegistrationFichaUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { registrationId: string } }>,
        reply: FastifyReply,
    ) {
        const response = await this.useCase.execute(request.params.registrationId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(204).send();
    }
}
