import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateUserAdminUseCase } from '../../usecase/create-user-admin.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';

export class CreateUserAdminController {
    constructor(
        private readonly createUserAdminUseCase: CreateUserAdminUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const actorPerms = [...adminOf(request).permissions];
        const { username, password, userDataId, userRole } = request.body as {
            username: string;
            password: string;
            userDataId: string;
            userRole: string;
        };
        const response = await this.createUserAdminUseCase.execute(
            {
                username,
                password,
                userDataId,
                userRole,
            },
            actorPerms,
        );
        if (response.error) {
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error?.message });
        }
        return reply.status(201).send({ userAdminId: response.userAdminId });
    }
}
