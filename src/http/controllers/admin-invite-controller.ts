import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateAdminInviteUseCase } from '../../usecase/create-admin-invite.js';
import type { GetAdminInviteUseCase } from '../../usecase/get-admin-invite.js';
import type { AcceptAdminInviteUseCase } from '../../usecase/accept-admin-invite.js';
import type { ListAdminInvitesUseCase } from '../../usecase/list-admin-invites.js';
import type { RevokeAdminInviteUseCase } from '../../usecase/revoke-admin-invite.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class AdminInviteController {
    constructor(
        private readonly createUseCase: CreateAdminInviteUseCase,
        private readonly getUseCase: GetAdminInviteUseCase,
        private readonly acceptUseCase: AcceptAdminInviteUseCase,
        private readonly listUseCase: ListAdminInvitesUseCase,
        private readonly revokeUseCase: RevokeAdminInviteUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async list(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_USER_ADMIN', this.getAdminPermissions)) === null)
            return;
        return reply.send(await this.listUseCase.execute());
    }

    async revoke(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'CREATE_USER_ADMIN', this.getAdminPermissions)) === null)
            return;
        const r = await this.revokeUseCase.execute(request.params.id);
        if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
        return reply.status(204).send();
    }

    async create(
        request: FastifyRequest<{
 Body: {
 userDataId: string;
rulesId: string 
} 
}>,
        reply: FastifyReply,
    ) {
        const actorId = await requirePermission(
            request,
            reply,
            'CREATE_USER_ADMIN',
            this.getAdminPermissions,
        );
        if (actorId === null) return;
        const actorPerms = (await this.getAdminPermissions.execute(actorId)) ?? [];
        const { userDataId, rulesId } = request.body;
        const r = await this.createUseCase.execute(userDataId, rulesId, actorPerms);
        if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
        return reply.status(201).send({ token: r.token,
expiresAt: r.expiresAt });
    }

    async get(request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) {
        const r = await this.getUseCase.execute(request.params.token);
        if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
        return reply.send(r.invite);
    }

    async accept(
        request: FastifyRequest<{
 Params: { token: string };
Body: {
 username: string;
password: string 
} 
}>,
        reply: FastifyReply,
    ) {
        const r = await this.acceptUseCase.execute(
            request.params.token,
            request.body.username,
            request.body.password,
        );
        if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
        return reply.status(200).send({ message: 'ok' });
    }
}
