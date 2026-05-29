import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateUserAdminUseCase } from '../../usecase/create-user-admin.js';

export class CreateUserAdminController {
    constructor(private createUserAdminUseCase: CreateUserAdminUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const { username, password, userDataId, userRole } = request.body as {
            username: string;
            password: string;
            userDataId: string;
            userRole: string;
        };
        const authHeader = request.headers['authorization'];
        const creatorToken = authHeader?.replace('Bearer ', '') ?? '';

        const response = await this.createUserAdminUseCase.execute({
            username,
            password,
            userDataId,
            userRole,
            creatorToken,
        });

        if (!response.success) {
            const msg = response.error?.message ?? 'Failed to create admin';
            if (msg.includes('Invalid or expired token')) {
                return reply.status(401).send({ error: msg });
            }
            if (msg.includes('Permission denied')) {
                return reply.status(403).send({ error: msg });
            }
            if (msg.includes('already exists') || msg.includes('already has an admin')) {
                return reply.status(409).send({ error: msg });
            }
            return reply.status(400).send({ error: msg });
        }

        return reply.status(201).send({ userAdminId: response.userAdminId });
    }
}
