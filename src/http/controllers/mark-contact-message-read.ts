import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { MarkContactMessageReadUseCase } from '../../usecase/mark-contact-message-read.js';

type Params = { messageId: string };

export class MarkContactMessageReadController {
    constructor(private readonly useCase: MarkContactMessageReadUseCase) {}

    async handle(req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const response = await this.useCase.execute(req.params.messageId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'Marked as read' });
    }
}
