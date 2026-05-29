import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListRoomsUseCase } from '../../usecase/list-rooms.js';

export class ListRoomsController {
    constructor(private readonly useCase: ListRoomsUseCase) {}

    async handle(_request: FastifyRequest, reply: FastifyReply) {
        const response = await this.useCase.execute();
        return reply.status(200).send(response.rooms);
    }
}
