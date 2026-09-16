import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
    ListConvenioMenuUseCase,
    ListConveniosUseCase,
    GetPublicConvenioUseCase,
    GetConvenioUseCase,
    CreateConvenioUseCase,
    UpdateConvenioUseCase,
    DeleteConvenioUseCase,
} from '../../usecase/convenio-usecases.js';
import type { UploadConvenioLogoUseCase } from '../../usecase/upload-convenio-logo.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type IdParams = { id: string };
type SlugParams = { slug: string };

export type ConvenioUseCases = {
    listMenu: ListConvenioMenuUseCase;
    list: ListConveniosUseCase;
    getPublic: GetPublicConvenioUseCase;
    get: GetConvenioUseCase;
    create: CreateConvenioUseCase;
    update: UpdateConvenioUseCase;
    remove: DeleteConvenioUseCase;
    uploadLogo: UploadConvenioLogoUseCase;
};

export class ConvenioController {
    constructor(
        private readonly uc: ConvenioUseCases,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    private fail(reply: FastifyReply, error: Error) {
        return reply.status(errorToStatus(error)).send({ error: error.message });
    }

    // ── Público ──────────────────────────────────────────────────────────────
    async menu(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await this.uc.listMenu.execute());
    }

    async getPublic(request: FastifyRequest<{ Params: SlugParams }>, reply: FastifyReply) {
        const r = await this.uc.getPublic.execute(request.params.slug);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.convenio);
    }

    // ── Admin ────────────────────────────────────────────────────────────────
    async list(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_CONVENIO', this.getAdminPermissions)) === null) return;
        return reply.send(await this.uc.list.execute());
    }

    async get(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_CONVENIO', this.getAdminPermissions)) === null) return;
        const r = await this.uc.get.execute(request.params.id);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.convenio);
    }

    async create(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'CREATE_CONVENIO', this.getAdminPermissions)) === null) return;
        const r = await this.uc.create.execute(request.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(201).send(r.convenio);
    }

    async update(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_CONVENIO', this.getAdminPermissions)) === null) return;
        const r = await this.uc.update.execute(request.params.id, request.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.convenio);
    }

    async remove(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'DELETE_CONVENIO', this.getAdminPermissions)) === null) return;
        const r = await this.uc.remove.execute(request.params.id);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(204).send();
    }

    async uploadLogo(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_CONVENIO', this.getAdminPermissions)) === null) return;
        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });

        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        if (data.file.truncated) return reply.status(400).send({ error: 'Arquivo excede o limite permitido.' });

        const r = await this.uc.uploadLogo.execute(request.params.id, Buffer.concat(chunks), data.mimetype);
        if (r.error) return this.fail(reply, r.error);
        return reply.send({ logoUrl: r.logoUrl });
    }
}
