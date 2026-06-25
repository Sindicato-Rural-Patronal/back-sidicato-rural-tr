import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { DeleteContactMessageUseCase } from '../../usecase/delete-contact-message.js';

type Params = { messageId: string };

export class DeleteContactMessageController {
    constructor(private readonly useCase: DeleteContactMessageUseCase) {}

    async handle(req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const { messageId } = req.params;
        const response = await this.useCase.execute(messageId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(204).send();
    }
}
