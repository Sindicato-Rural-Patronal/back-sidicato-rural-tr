import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createGalleryAdapter } from '../../adapter/database/gallery-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createStorageAdapter } from '../../adapter/storage/factory.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import {
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
import { GalleryController } from '../controllers/gallery-controller.js';
import { errorResponse } from '../lib/swagger-schemas.js';

// fast-json-stringify descarta campos não declarados: tudo que sai está listado.
const str = { type: 'string' };
const nstr = { type: 'string',
nullable: true };

const photoObject = {
    type: 'object',
    properties: { id: str,
albumId: str,
url: str,
caption: nstr,
order: { type: 'integer' },
createdAt: str },
};

const albumProperties = {
    id: str,
    title: str,
    description: nstr,
    linkUrl: nstr,
    isActive: { type: 'boolean' },
    order: { type: 'integer' },
    createdAt: str,
    updatedAt: str,
};

const albumObject = { type: 'object',
properties: albumProperties };
const albumWithPhotos = {
    type: 'object',
    properties: { ...albumProperties,
photos: { type: 'array',
items: photoObject } },
};

// O corpo é validado de verdade pelo zod no caso de uso; aqui é documentação.
const albumBody = {
    type: 'object',
    properties: {
        title: { type: 'string',
example: 'Patrulha Rural' },
        description: nstr,
        linkUrl: { type: 'string',
nullable: true,
example: 'https://www.sistemafaep.org.br' },
        isActive: { type: 'boolean' },
    },
};

const orderBody = {
    type: 'object',
    required: ['order'],
    properties: { order: { type: 'array',
items: str,
description: 'Ids na nova ordem' } },
};

const idParams = { type: 'object',
required: ['id'],
properties: { id: str } };
const photoParams = { type: 'object',
required: ['id', 'photoId'],
properties: { id: str,
photoId: str } };
const sec = [{ bearerAuth: [] }];
const errs = { 400: errorResponse,
401: errorResponse,
403: errorResponse,
404: errorResponse };
const tags = ['Galerias'];
const ok = { type: 'object',
properties: { message: str } };

export async function galleryRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createGalleryAdapter(prisma);
    const storage = createStorageAdapter();
    const controller = new GalleryController(
        {
            list: new ListGalleriesUseCase(repo),
            create: new CreateGalleryUseCase(repo),
            update: new UpdateGalleryUseCase(repo),
            remove: new DeleteGalleryUseCase(repo, storage),
            reorder: new ReorderGalleriesUseCase(repo),
            uploadPhoto: new UploadGalleryPhotoUseCase(repo, storage),
            updatePhoto: new UpdateGalleryPhotoUseCase(repo),
            removePhoto: new DeleteGalleryPhotoUseCase(repo, storage),
            reorderPhotos: new ReorderGalleryPhotosUseCase(repo),
        },
        new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma)),
    );

    type Id = FastifyRequest<{ Params: { id: string } }>;
    type Photo = FastifyRequest<{
 Params: {
 id: string;
photoId: string 
} 
}>;

    fastify.get('/galleries', {
        schema: {
            tags,
            summary: 'Galerias da home (público)',
            description: 'Só galerias ativas com pelo menos uma foto, na ordem definida no painel.',
            response: { 200: { type: 'array',
items: albumWithPhotos } },
        },
    }, (req: FastifyRequest, res: FastifyReply) => controller.listPublic(req, res));

    fastify.get('/admin/galleries', {
        schema: {
            tags,
summary: 'Todas as galerias, com fotos',
security: sec,
            response: { 200: { type: 'array',
items: albumWithPhotos },
401: errorResponse,
403: errorResponse },
        },
    }, (req: FastifyRequest, res: FastifyReply) => controller.listAdmin(req, res));

    fastify.post('/admin/galleries', {
        schema: {
            tags,
summary: 'Criar galeria',
security: sec,
body: { ...albumBody,
required: ['title'] },
            response: { 201: albumObject,
...errs },
        },
    }, (req: FastifyRequest, res: FastifyReply) => controller.create(req, res));

    // Antes de /:id para "reorder" não ser lido como id.
    fastify.patch('/admin/galleries/reorder', {
        schema: { tags,
summary: 'Reordenar galerias',
security: sec,
body: orderBody,
response: { 200: ok,
...errs } },
    }, (req: FastifyRequest, res: FastifyReply) => controller.reorder(req, res));

    fastify.patch('/admin/galleries/:id', {
        schema: {
            tags,
summary: 'Atualizar galeria',
security: sec,
params: idParams,
body: albumBody,
            response: { 200: albumObject,
...errs },
        },
    }, (req: Id, res: FastifyReply) => controller.update(req, res));

    fastify.delete('/admin/galleries/:id', {
        schema: { tags,
summary: 'Excluir galeria (e as fotos)',
security: sec,
params: idParams,
response: { 204: { type: 'null' },
...errs } },
    }, (req: Id, res: FastifyReply) => controller.remove(req, res));

    fastify.post('/admin/galleries/:id/photos', {
        schema: {
            tags,
            summary: 'Enviar foto (multipart, campo "file")',
            description: 'JPG, PNG, WEBP ou GIF até 15MB. Reduzida para caber em 1600×1600 e salva em JPEG.',
            security: sec,
            params: idParams,
            consumes: ['multipart/form-data'],
            response: { 201: photoObject,
...errs },
        },
    }, (req: Id, res: FastifyReply) => controller.uploadPhoto(req, res));

    fastify.patch('/admin/galleries/:id/photos/reorder', {
        schema: { tags,
summary: 'Reordenar fotos da galeria',
security: sec,
params: idParams,
body: orderBody,
response: { 200: ok,
...errs } },
    }, (req: Id, res: FastifyReply) => controller.reorderPhotos(req, res));

    fastify.patch('/admin/galleries/:id/photos/:photoId', {
        schema: {
            tags,
            summary: 'Editar legenda da foto',
            security: sec,
            params: photoParams,
            body: { type: 'object',
properties: { caption: nstr } },
            response: { 200: photoObject,
...errs },
        },
    }, (req: Photo, res: FastifyReply) => controller.updatePhoto(req, res));

    fastify.delete('/admin/galleries/:id/photos/:photoId', {
        schema: { tags,
summary: 'Excluir foto',
security: sec,
params: photoParams,
response: { 204: { type: 'null' },
...errs } },
    }, (req: Photo, res: FastifyReply) => controller.removePhoto(req, res));
}
