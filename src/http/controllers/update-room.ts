import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateRoomUseCase } from '../../usecase/update-room.js';
import { errorToStatus } from '../lib/require-permission.js';

type Params = { roomId: string };
type Body = {
 name: string;
description: string;
maxCapacity: number 
};

export class UpdateRoomController {
    constructor(
        private readonly useCase: UpdateRoomUseCase,
    ) {}

    async handle(request: FastifyRequest<{
 Params: Params;
Body: Body 
}>, reply: FastifyReply) {
        const response = await this.useCase.execute(request.params.roomId, request.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'ok' });
    }
}
