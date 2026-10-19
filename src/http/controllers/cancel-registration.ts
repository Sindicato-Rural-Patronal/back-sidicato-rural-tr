import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CancelRegistrationUseCase } from '../../usecase/cancel-registration.js';

type Params = { registrationId: string };

export class CancelRegistrationController {
    constructor(
        private readonly useCase: CancelRegistrationUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const response = await this.useCase.execute(request.params.registrationId);
        if (response.error) {
            const status = response.error?.message === 'Registration not found' ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
