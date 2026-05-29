import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateRoomUseCase } from '../../usecase/create-room.js';

type CreateRoomBody = {
    name: string;
    description: string;
    maxCapacity: number;
};

export class CreateRoomController {
    constructor(private readonly useCase: CreateRoomUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as CreateRoomBody;
        const response = await this.useCase.execute(body);
        if (!response.success) {
            return reply.status(400).send({ error: response.error?.message });
        }
        return reply.status(201).send({ id: response.roomId });
    }
}
