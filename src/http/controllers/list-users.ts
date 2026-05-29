import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListUsersUseCase } from '../../usecase/list-users.js';

export class ListUsersController {
    constructor(private readonly useCase: ListUsersUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const response = await this.useCase.execute(token);
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(200).send(response.users);
    }
}
