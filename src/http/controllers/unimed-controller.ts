import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListUnimedUseCase } from '../../usecase/list-unimed.js';
import type { GetUnimedUseCase } from '../../usecase/get-unimed.js';
import type { CreateUnimedUseCase } from '../../usecase/create-unimed.js';
import type { UpdateUnimedUseCase } from '../../usecase/update-unimed.js';
import type { DeleteUnimedUseCase } from '../../usecase/delete-unimed.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type IdParams = { id: string };

// Cada beneficiário Unimed É um usuário — daí os endpoints usarem as permissões
// de USER (READ/CREATE/UPDATE/DELETE_USER).
export class UnimedController {
    constructor(
        private readonly listUseCase: ListUnimedUseCase,
        private readonly getUseCase: GetUnimedUseCase,
        private readonly createUseCase: CreateUnimedUseCase,
        private readonly updateUseCase: UpdateUnimedUseCase,
        private readonly deleteUseCase: DeleteUnimedUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async list(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_USER', this.getAdminPermissions)) === null) return;
        return reply.send(await this.listUseCase.execute(request.query));
    }

    async get(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_USER', this.getAdminPermissions)) === null) return;
        const res = await this.getUseCase.execute(request.params.id);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.send(res.beneficiario);
    }

    async create(request: FastifyRequest, reply: FastifyReply) {
        const actorId = await requirePermission(request, reply, 'CREATE_USER', this.getAdminPermissions);
        if (actorId === null) return;
        const res = await this.createUseCase.execute(request.body, actorId);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(201).send(res.beneficiario);
    }

    async update(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) === null) return;
        const res = await this.updateUseCase.execute(request.params.id, request.body);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(200).send({ message: 'ok' });
    }

    async remove(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'DELETE_USER', this.getAdminPermissions)) === null) return;
        const res = await this.deleteUseCase.execute(request.params.id);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(204).send();
    }
}
