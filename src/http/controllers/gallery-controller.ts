import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
    ListGalleriesUseCase,
    CreateGalleryUseCase,
    UpdateGalleryUseCase,
    DeleteGalleryUseCase,
    ReorderGalleriesUseCase,
    UploadGalleryPhotoUseCase,
    UpdateGalleryPhotoUseCase,
    DeleteGalleryPhotoUseCase,
    ReorderGalleryPhotosUseCase,
} from '../../usecase/gallery-usecases.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import type { Permission } from '../../generated/prisma/enums.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type IdParams = { id: string };
type PhotoParams = {
 id: string;
photoId: string 
};

export type GalleryUseCases = {
    list: ListGalleriesUseCase;
    create: CreateGalleryUseCase;
    update: UpdateGalleryUseCase;
    remove: DeleteGalleryUseCase;
    reorder: ReorderGalleriesUseCase;
    uploadPhoto: UploadGalleryPhotoUseCase;
    updatePhoto: UpdateGalleryPhotoUseCase;
    removePhoto: DeleteGalleryPhotoUseCase;
    reorderPhotos: ReorderGalleryPhotosUseCase;
};

// Galerias são conteúdo da home → mesmas permissões dos banners.
export class GalleryController {
    constructor(
        private readonly uc: GalleryUseCases,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    private can(req: FastifyRequest, reply: FastifyReply, perm: Permission) {
        return requirePermission(req, reply, perm, this.getAdminPermissions);
    }

    private fail(reply: FastifyReply, error: Error) {
        return reply.status(errorToStatus(error)).send({ error: error.message });
    }

    async listPublic(_req: FastifyRequest, reply: FastifyReply) {
        return reply.send(await this.uc.list.execute(true));
    }

    async listAdmin(req: FastifyRequest, reply: FastifyReply) {
        if ((await this.can(req, reply, 'READ_BANNER')) === null) return;
        return reply.send(await this.uc.list.execute(false));
    }

    async create(req: FastifyRequest, reply: FastifyReply) {
        if ((await this.can(req, reply, 'CREATE_BANNER')) === null) return;
        const r = await this.uc.create.execute(req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(201).send(r.album);
    }

    async update(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_BANNER')) === null) return;
        const r = await this.uc.update.execute(req.params.id, req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.album);
    }

    async remove(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'DELETE_BANNER')) === null) return;
        const r = await this.uc.remove.execute(req.params.id);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(204).send();
    }

    async reorder(req: FastifyRequest, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_BANNER')) === null) return;
        const r = await this.uc.reorder.execute(req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.send({ message: 'ok' });
    }

    async uploadPhoto(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_BANNER')) === null) return;
        const data = await req.file();
        if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });

        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        if (data.file.truncated) return reply.status(400).send({ error: 'Arquivo excede o limite permitido.' });

        const r = await this.uc.uploadPhoto.execute(req.params.id, Buffer.concat(chunks), data.mimetype);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(201).send(r.photo);
    }

    async updatePhoto(req: FastifyRequest<{ Params: PhotoParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_BANNER')) === null) return;
        const r = await this.uc.updatePhoto.execute(req.params.id, req.params.photoId, req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.photo);
    }

    async removePhoto(req: FastifyRequest<{ Params: PhotoParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_BANNER')) === null) return;
        const r = await this.uc.removePhoto.execute(req.params.id, req.params.photoId);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(204).send();
    }

    async reorderPhotos(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_BANNER')) === null) return;
        const r = await this.uc.reorderPhotos.execute(req.params.id, req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.send({ message: 'ok' });
    }
}
