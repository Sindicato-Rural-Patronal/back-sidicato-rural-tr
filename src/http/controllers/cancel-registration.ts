import { FastifyRequest, FastifyReply } from 'fastify';
import { CancelRegistrationUseCase } from '../../usecase/cancel-registration.js';

type Params = { registrationId: string };

export class CancelRegistrationController {
    constructor(private readonly useCase: CancelRegistrationUseCase) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const response = await this.useCase.execute({ token, registrationId: request.params.registrationId });
        if (!response.success) {
            const fallback = response.error?.message === 'Registration not found' ? 404 : 400;
            return reply.status(response.statusCode ?? fallback).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
