import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { CreateContactMessageUseCase } from '../../usecase/create-contact-message.js';

type Body = {
    name: string;
    email: string;
    phone?: string | null;
    subject?: string | null;
    message: string;
};

export class CreateContactMessageController {
    constructor(private readonly useCase: CreateContactMessageUseCase) {}

    async handle(req: FastifyRequest<{ Body: Body }>, reply: FastifyReply) {
        const response = await this.useCase.execute(req.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(201).send(response.message);
    }
}
