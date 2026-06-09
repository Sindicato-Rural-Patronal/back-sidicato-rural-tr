import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetCurrentAdminUseCase } from '../../usecase/get-current-admin.js';

export class GetCurrentAdminController {
    constructor(private readonly useCase: GetCurrentAdminUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const result = await this.useCase.execute(token);
        if (!result.success) {
            return reply.status(result.statusCode ?? 401).send({ error: result.error?.message });
        }
        return reply.status(200).send(result.data);
    }
}
