import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteRoomUseCase } from '../../usecase/delete-room.js';
import { errorToStatus } from '../lib/require-permission.js';

export class DeleteRoomController {
    constructor(
        private readonly useCase: DeleteRoomUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { roomId: string } }>, reply: FastifyReply) {
        const response = await this.useCase.execute(request.params.roomId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(204).send();
    }
}
