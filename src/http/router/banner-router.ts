import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createBannerAdapter } from '../../adapter/database/banner-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createStorageAdapter } from '../../adapter/storage/factory.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { CreateBannerUseCase } from '../../usecase/create-banner.js';
import { ListBannersUseCase } from '../../usecase/list-banners.js';
import { ListAllBannersUseCase } from '../../usecase/list-all-banners.js';
import { UpdateBannerUseCase } from '../../usecase/update-banner.js';
import { DeleteBannerUseCase } from '../../usecase/delete-banner.js';
import { UploadBannerImageUseCase } from '../../usecase/upload-banner-image.js';
import { ReorderBannersUseCase } from '../../usecase/reorder-banners.js';
import { CreateBannerController } from '../controllers/create-banner.js';
import { ListBannersController } from '../controllers/list-banners.js';
import { ListAllBannersController } from '../controllers/list-all-banners.js';
import { UpdateBannerController } from '../controllers/update-banner.js';
import { DeleteBannerController } from '../controllers/delete-banner.js';
import { UploadBannerImageController } from '../controllers/upload-banner-image.js';
import { ReorderBannersController } from '../controllers/reorder-banners.js';
import { requirePermission } from '../lib/require-permission.js';

const buttonSchema = {
    type: 'object',
    properties: {
        label: { type: 'string', example: 'Saiba mais' },
        url: { type: 'string', example: '/cursos' },
        external: { type: 'boolean', example: false },
        variant: { type: 'string', enum: ['primary', 'secondary'], example: 'primary' },
    },
};

const bannerFullSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        subtitle: { type: 'string', nullable: true },
        imageUrl: { type: 'string', nullable: true },
        active: { type: 'boolean' },
        order: { type: 'integer' },
        buttons: { type: 'array', items: buttonSchema },
        startDate: { type: 'string', format: 'date-time', nullable: true },
        endDate: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
    },
};

const bannerBodySchema = {
    type: 'object',
    properties: {
        title: { type: 'string', maxLength: 100, example: 'Novos cursos disponíveis!' },
        subtitle: { type: 'string', maxLength: 200, nullable: true, example: 'Inscreva-se agora e garanta sua vaga.' },
        active: { type: 'boolean', example: true },
        order: { type: 'integer', minimum: 0, example: 1 },
        buttons: {
            type: 'array',
            maxItems: 2,
            items: {
                type: 'object',
                required: ['label', 'url'],
                properties: {
                    label: { type: 'string', maxLength: 40 },
                    url: { type: 'string', maxLength: 500 },
                    external: { type: 'boolean', default: false },
                    variant: { type: 'string', enum: ['primary', 'secondary'], default: 'primary' },
                },
            },
        },
        startDate: { type: 'string', format: 'date-time', nullable: true, example: '2026-08-01T00:00:00-03:00' },
        endDate: { type: 'string', format: 'date-time', nullable: true, example: '2026-08-31T23:59:00-03:00' },
    },
};

export async function bannerRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createBannerAdapter(prisma);
    const storage = createStorageAdapter();
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const listCtrl = new ListBannersController(new ListBannersUseCase(repo));
    const listAllCtrl = new ListAllBannersController(new ListAllBannersUseCase(repo));
    const createCtrl = new CreateBannerController(new CreateBannerUseCase(repo));
    const updateCtrl = new UpdateBannerController(new UpdateBannerUseCase(repo));
    const deleteCtrl = new DeleteBannerController(new DeleteBannerUseCase(repo, storage));
    const uploadCtrl = new UploadBannerImageController(new UploadBannerImageUseCase(repo, storage));
    const reorderCtrl = new ReorderBannersController(new ReorderBannersUseCase(repo));

    // Public
    fastify.get(
        '/banners',
        {
            schema: {
                tags: ['Banners'],
                summary: 'Listar banners ativos (home)',
                description: 'Retorna banners ativos filtrados por active=true e por startDate/endDate. Sem autenticação.',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        title: { type: 'string' },
                                        subtitle: { type: 'string', nullable: true },
                                        imageUrl: { type: 'string', nullable: true },
                                        buttons: { type: 'array', items: buttonSchema },
                                    },
                                },
                            },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            totalPages: { type: 'integer' },
                        },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listCtrl.handle(req as Parameters<typeof listCtrl.handle>[0], res),
    );

    // Admin — list all
    fastify.get(
        '/admin/banners',
        {
            schema: {
                tags: ['Banners — Admin'],
                summary: 'Listar todos os banners',
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            data: { type: 'array', items: bannerFullSchema },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            totalPages: { type: 'integer' },
                        },
                    },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            if (!(await requirePermission(req, res, 'READ_BANNER', getAdminPermissions))) return;
            return listAllCtrl.handle(req as Parameters<typeof listAllCtrl.handle>[0], res);
        },
    );

    // Admin — reorder (must be before /:id to avoid route conflict)
    fastify.patch(
        '/admin/banners/reorder',
        {
            schema: {
                tags: ['Banners — Admin'],
                summary: 'Reordenar banners',
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['order'],
                    properties: {
                        order: { type: 'array', items: { type: 'string' }, description: 'Array de IDs na nova ordem' },
                    },
                },
                response: {
                    200: { type: 'object', properties: { message: { type: 'string' } } },
                    400: { type: 'object', properties: { error: { type: 'string' } } },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            if (!(await requirePermission(req, res, 'UPDATE_BANNER', getAdminPermissions))) return;
            return reorderCtrl.handle(req, res);
        },
    );

    // Admin — create
    fastify.post(
        '/admin/banners',
        {
            schema: {
                tags: ['Banners — Admin'],
                summary: 'Criar banner',
                security: [{ bearerAuth: [] }],
                body: { ...bannerBodySchema, required: ['title'] },
                response: {
                    201: bannerFullSchema,
                    400: { type: 'object', properties: { error: { type: 'string' } } },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            if (!(await requirePermission(req, res, 'CREATE_BANNER', getAdminPermissions))) return;
            return createCtrl.handle(req, res);
        },
    );

    // Admin — update by id
    fastify.patch(
        '/admin/banners/:id',
        {
            schema: {
                tags: ['Banners — Admin'],
                summary: 'Atualizar banner',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } },
                },
                body: bannerBodySchema,
                response: {
                    200: bannerFullSchema,
                    400: { type: 'object', properties: { error: { type: 'string' } } },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            if (!(await requirePermission(req, res, 'UPDATE_BANNER', getAdminPermissions))) return;
            return updateCtrl.handle(req as Parameters<typeof updateCtrl.handle>[0], res);
        },
    );

    // Admin — delete
    fastify.delete(
        '/admin/banners/:id',
        {
            schema: {
                tags: ['Banners — Admin'],
                summary: 'Excluir banner',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } },
                },
                response: {
                    204: { type: 'null' },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            if (!(await requirePermission(req, res, 'DELETE_BANNER', getAdminPermissions))) return;
            return deleteCtrl.handle(req as Parameters<typeof deleteCtrl.handle>[0], res);
        },
    );

    // Admin — upload image
    fastify.post(
        '/admin/banners/:id/image',
        {
            schema: {
                tags: ['Banners — Admin'],
                summary: 'Upload de imagem do banner',
                description: 'Aceita multipart/form-data com campo "file". PNG/JPG/WebP, max 5MB. Redimensiona para 1440×600px.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } },
                },
                response: {
                    200: { type: 'object', properties: { imageUrl: { type: 'string' } } },
                    400: { type: 'object', properties: { error: { type: 'string' } } },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            if (!(await requirePermission(req, res, 'UPDATE_BANNER', getAdminPermissions))) return;
            return uploadCtrl.handle(req as Parameters<typeof uploadCtrl.handle>[0], res);
        },
    );
}
