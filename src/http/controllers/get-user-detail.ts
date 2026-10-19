import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetUserDetailUseCase } from '../../usecase/get-user-detail.js';
import { errorToStatus } from '../lib/require-permission.js';

export class GetUserDetailController {
    constructor(
        private readonly useCase: GetUserDetailUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const { id } = request.params;
        const result = await this.useCase.execute(id);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send(result.user);
    }
}
