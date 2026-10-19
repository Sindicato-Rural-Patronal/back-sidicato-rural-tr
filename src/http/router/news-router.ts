import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createNewsAdapter } from '../../adapter/database/news-adapter.js';
import { createStorageAdapter } from '../../adapter/storage/factory.js';
import { CreateNewsUseCase } from '../../usecase/create-news.js';
import { ListNewsUseCase } from '../../usecase/list-news.js';
import { GetNewsDetailUseCase } from '../../usecase/get-news-detail.js';
import { UpdateNewsUseCase } from '../../usecase/update-news.js';
import { DeleteNewsUseCase } from '../../usecase/delete-news.js';
import { UploadNewsBannerUseCase } from '../../usecase/upload-news-banner.js';
import { CreateNewsController } from '../controllers/create-news.js';
import { ListNewsController } from '../controllers/list-news.js';
import { ListAllNewsController } from '../controllers/list-all-news.js';
import { GetNewsDetailController } from '../controllers/get-news-detail.js';
import { UpdateNewsController } from '../controllers/update-news.js';
import { DeleteNewsController } from '../controllers/delete-news.js';
import { UploadNewsBannerController } from '../controllers/upload-news-banner.js';
import { UploadNewsBlockImageUseCase } from '../../usecase/upload-news-block-image.js';
import { UploadNewsBlockImageController } from '../controllers/upload-news-block-image.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';
import { publicRoute, requires } from '../lib/route-auth.js';

const newsProperties = {
    id: { type: 'string' },
    title: { type: 'string' },
    content: { type: 'string' },
    summary: { type: 'string',
nullable: true },
    bannerUrl: { type: 'string',
nullable: true },
    status: { type: 'string',
enum: ['PUBLISHED', 'UNPUBLISHED'] },
    publishedAt: { type: 'string',
nullable: true },
    publishAt: { type: 'string',
nullable: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

export async function newsRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const newsRepository = createNewsAdapter(prisma);
    const storage = createStorageAdapter();

    const createNewsController = new CreateNewsController(
        new CreateNewsUseCase(newsRepository),
    );
    const listNewsController = new ListNewsController(new ListNewsUseCase(newsRepository));
    const listAllNewsController = new ListAllNewsController(
        new ListNewsUseCase(newsRepository),
    );
    const getNewsDetailController = new GetNewsDetailController(
        new GetNewsDetailUseCase(newsRepository),
    );
    const updateNewsController = new UpdateNewsController(
        new UpdateNewsUseCase(newsRepository),
    );
    const deleteNewsController = new DeleteNewsController(
        new DeleteNewsUseCase(newsRepository),
    );
    const uploadBannerController = new UploadNewsBannerController(
        new UploadNewsBannerUseCase(storage, newsRepository),
    );
    const uploadBlockImageController = new UploadNewsBlockImageController(
        new UploadNewsBlockImageUseCase(storage, newsRepository),
    );

    // ─── Public routes ─────────────────────────────────────────────────────────

    fastify.get(
        '/news',
        {
            config: { auth: publicRoute() },
            schema: {
                tags: ['News'],
                summary: 'List published news',
                description:
                    'Notícias publicadas, mais recentes primeiro. Agendadas para depois ficam de fora até a hora chegar (relógio de Brasília).',
                querystring: paginationQuerystring,
                response: {
                    200: pagedResponse({ type: 'object',
properties: newsProperties }),
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listNewsController.handle(req, res),
    );

    fastify.get(
        '/news/:newsId',
        {
            config: { auth: publicRoute() },
            schema: {
                tags: ['News'],
                summary: 'News detail',
                params: {
                    type: 'object',
                    required: ['newsId'],
                    properties: { newsId: { type: 'string' } },
                },
                response: {
                    200: { type: 'object',
properties: newsProperties },
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
            getNewsDetailController.handle(req, res),
    );

    // ─── Admin routes ───────────────────────────────────────────────────────────

    fastify.get(
        '/admin/news',
        {
            config: { auth: requires('READ_NEWS') },
            schema: {
                tags: ['Admin — News'],
                summary: 'List all news (internal)',
                description:
                    'Returns all news regardless of status. Requires READ_NEWS permission.',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer',
minimum: 1,
default: 1 },
                        limit: { type: 'integer',
minimum: 1,
maximum: 1000,
default: 20 },
                        status: {
                            type: 'string',
                            enum: ['PUBLISHED', 'SCHEDULED', 'UNPUBLISHED'],
                            description:
                                'PUBLISHED = já no ar; SCHEDULED = publicada, mas agendada para depois; UNPUBLISHED = rascunho',
                        },
                        search: { type: 'string',
description: 'Buscar por título' },
                    },
                },
                response: {
                    200: pagedResponse({ type: 'object',
properties: newsProperties }),
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listAllNewsController.handle(req, res),
    );

    fastify.post(
        '/news',
        {
            config: { auth: requires('CREATE_NEWS') },
            schema: {
                tags: ['News'],
                summary: 'Create news',
                body: {
                    type: 'object',
                    required: ['title', 'content'],
                    properties: {
                        title: { type: 'string',
example: 'Sindicato realiza assembleia geral em agosto' },
                        content: { type: 'string',
example: '<p>A assembleia geral será realizada no dia 10 de agosto...</p>' },
                        summary: { type: 'string',
example: 'Assembleia geral com pauta sobre renovação de diretoria.' },
                        status: { type: 'string',
enum: ['PUBLISHED', 'UNPUBLISHED'],
example: 'UNPUBLISHED' },
                        publishedAt: { type: 'string',
format: 'date-time',
example: '2026-08-10T08:00:00-03:00' },
                        publishAt: {
                            type: 'string',
                            format: 'date-time',
                            nullable: true,
                            description:
                                'Agendamento: hora "de parede" de Brasília com Z. null/ausente = no ar assim que o status for PUBLISHED.',
                            example: '2026-08-10T08:00:00.000Z',
                        },
                    },
                },
                response: {
                    201: { type: 'object',
properties: { id: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => createNewsController.handle(req, res),
    );

    fastify.patch(
        '/news/:newsId',
        {
            config: { auth: requires('UPDATE_NEWS') },
            schema: {
                tags: ['News'],
                summary: 'Update news',
                params: {
                    type: 'object',
                    required: ['newsId'],
                    properties: { newsId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    properties: {
                        title: { type: 'string',
example: 'Assembleia geral em agosto — novo título' },
                        content: { type: 'string',
example: '<p>Conteúdo atualizado...</p>' },
                        summary: { type: 'string',
nullable: true,
example: 'Resumo atualizado da notícia.' },
                        status: { type: 'string',
enum: ['PUBLISHED', 'UNPUBLISHED'],
example: 'PUBLISHED' },
                        publishedAt: { type: 'string',
format: 'date-time',
nullable: true,
example: '2026-08-10T08:00:00-03:00' },
                        publishAt: {
                            type: 'string',
                            format: 'date-time',
                            nullable: true,
                            description: 'Agendamento (hora de Brasília com Z); null = publicar agora.',
                            example: '2026-08-10T08:00:00.000Z',
                        },
                    },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
            updateNewsController.handle(req, res),
    );

    fastify.delete(
        '/news/:newsId',
        {
            config: { auth: requires('DELETE_NEWS') },
            schema: {
                tags: ['News'],
                summary: 'Delete news',
                params: {
                    type: 'object',
                    required: ['newsId'],
                    properties: { newsId: { type: 'string' } },
                },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
            deleteNewsController.handle(req, res),
    );

    fastify.post(
        '/news/:newsId/banner',
        {
            config: { auth: requires('UPDATE_NEWS') },
            schema: {
                tags: ['News'],
                summary: 'Upload news banner',
                consumes: ['multipart/form-data'],
                params: {
                    type: 'object',
                    required: ['newsId'],
                    properties: { newsId: { type: 'string' } },
                },
                response: {
                    200: { type: 'object',
properties: { url: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
            uploadBannerController.handle(req, res),
    );

    fastify.post(
        '/news/:newsId/image',
        {
            config: { auth: requires('UPDATE_NEWS') },
            schema: {
                tags: ['News'],
                summary: 'Upload image for news content block',
                consumes: ['multipart/form-data'],
                params: {
                    type: 'object',
                    required: ['newsId'],
                    properties: { newsId: { type: 'string' } },
                },
                response: {
                    200: { type: 'object',
properties: { url: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
            uploadBlockImageController.handle(req, res),
    );
}
