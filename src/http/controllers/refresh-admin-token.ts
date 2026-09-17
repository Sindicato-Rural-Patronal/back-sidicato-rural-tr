import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RefreshAdminTokenUseCase } from '../../usecase/refresh-admin-token.js';

export class RefreshAdminTokenController {
    constructor(private refreshUseCase: RefreshAdminTokenUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const response = await this.refreshUseCase.execute(token);
        if (response.error) {
            return reply.status(401).send({ error: response.error.message });
        }
        return reply.status(200).send({ token: response.token });
    }
}
