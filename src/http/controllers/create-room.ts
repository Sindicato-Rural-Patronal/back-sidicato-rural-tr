import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateRoomUseCase } from '../../usecase/create-room.js';
import { errorToStatus } from '../lib/require-permission.js';

type CreateRoomBody = {
    name: string;
    description: string;
    maxCapacity: number;
};

export class CreateRoomController {
    constructor(
        private readonly useCase: CreateRoomUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as CreateRoomBody;
        const response = await this.useCase.execute(body);
        if (response.error) return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        return reply.status(201).send({ id: response.roomId });
    }
}
