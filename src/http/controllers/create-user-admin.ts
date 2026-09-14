import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateUserAdminUseCase } from '../../usecase/create-user-admin.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class CreateUserAdminController {
    constructor(
        private readonly createUserAdminUseCase: CreateUserAdminUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const actorId = await requirePermission(
            request,
            reply,
            'CREATE_USER_ADMIN',
            this.getAdminPermissions,
        );
        if (actorId === null) return;
        const actorPerms = (await this.getAdminPermissions.execute(actorId)) ?? [];
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
