import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client/extension';
import { createNewsAdapter } from '../../adapter/database/news-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
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

const newsProperties = {
    id: { type: 'string' },
    title: { type: 'string' },
    content: { type: 'string' },
    summary: { type: 'string', nullable: true },
    bannerUrl: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['PUBLICADO', 'NAO_PUBLICADO'] },
    publishedAt: { type: 'string', nullable: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

export async function newsRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const newsRepository = createNewsAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const storage = createStorageAdapter();

    const createNewsController = new CreateNewsController(
        new CreateNewsUseCase(newsRepository),
        userAdminRepository,
        ruleRepository,
    );
    const listNewsController = new ListNewsController(new ListNewsUseCase(newsRepository));
    const listAllNewsController = new ListAllNewsController(
        new ListNewsUseCase(newsRepository),
        userAdminRepository,
        ruleRepository,
    );
    const getNewsDetailController = new GetNewsDetailController(new GetNewsDetailUseCase(newsRepository));
    const updateNewsController = new UpdateNewsController(
        new UpdateNewsUseCase(newsRepository, userAdminRepository, ruleRepository),
    );
    const deleteNewsController = new DeleteNewsController(
        new DeleteNewsUseCase(newsRepository, userAdminRepository, ruleRepository),
    );
    const uploadBannerController = new UploadNewsBannerController(
        new UploadNewsBannerUseCase(storage, newsRepository, userAdminRepository, ruleRepository),
    );
    const uploadBlockImageController = new UploadNewsBlockImageController(
        new UploadNewsBlockImageUseCase(storage, newsRepository, userAdminRepository, ruleRepository),
    );

    // ─── Public routes ─────────────────────────────────────────────────────────

    fastify.get('/news', {
        schema: {
            tags: ['News'],
            summary: 'List published news',
            description: 'Returns all published news ordered by most recent first.',
            response: {
                200: { type: 'array', items: { type: 'object', properties: newsProperties } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => listNewsController.handle(req, res));

    fastify.get('/news/:newsId', {
        schema: {
            tags: ['News'],
            summary: 'News detail',
            params: {
                type: 'object',
                required: ['newsId'],
                properties: { newsId: { type: 'string' } },
            },
            response: {
                200: { type: 'object', properties: newsProperties },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
        getNewsDetailController.handle(req, res),
    );

    // ─── Admin routes ───────────────────────────────────────────────────────────

    fastify.get('/admin/news', {
        schema: {
            tags: ['Admin — News'],
            summary: 'List all news (internal)',
            description: 'Returns all news regardless of status. Requires READ_NEWS permission.',
            security: [{ bearerAuth: [] }],
            response: {
                200: { type: 'array', items: { type: 'object', properties: newsProperties } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => listAllNewsController.handle(req, res));

    fastify.post('/news', {
        schema: {
            tags: ['News'],
            summary: 'Create news',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['title', 'content'],
                properties: {
                    title: { type: 'string' },
                    content: { type: 'string' },
                    summary: { type: 'string' },
                    status: { type: 'string', enum: ['PUBLICADO', 'NAO_PUBLICADO'] },
                    publishedAt: { type: 'string', format: 'date-time' },
                },
            },
            response: {
                201: { type: 'object', properties: { id: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => createNewsController.handle(req, res));

    fastify.patch('/news/:newsId', {
        schema: {
            tags: ['News'],
            summary: 'Update news',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['newsId'],
                properties: { newsId: { type: 'string' } },
            },
            body: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    content: { type: 'string' },
                    summary: { type: 'string', nullable: true },
                    status: { type: 'string', enum: ['PUBLICADO', 'NAO_PUBLICADO'] },
                    publishedAt: { type: 'string', format: 'date-time', nullable: true },
                },
            },
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
        updateNewsController.handle(req, res),
    );

    fastify.delete('/news/:newsId', {
        schema: {
            tags: ['News'],
            summary: 'Delete news',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['newsId'],
                properties: { newsId: { type: 'string' } },
            },
            response: {
                204: { type: 'null' },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
        deleteNewsController.handle(req, res),
    );

    fastify.post('/news/:newsId/banner', {
        schema: {
            tags: ['News'],
            summary: 'Upload news banner',
            security: [{ bearerAuth: [] }],
            consumes: ['multipart/form-data'],
            params: {
                type: 'object',
                required: ['newsId'],
                properties: { newsId: { type: 'string' } },
            },
            response: {
                200: { type: 'object', properties: { url: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
        uploadBannerController.handle(req, res),
    );

    fastify.post('/news/:newsId/image', {
        schema: {
            tags: ['News'],
            summary: 'Upload image for news content block',
            security: [{ bearerAuth: [] }],
            consumes: ['multipart/form-data'],
            params: {
                type: 'object',
                required: ['newsId'],
                properties: { newsId: { type: 'string' } },
            },
            response: {
                200: { type: 'object', properties: { url: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { newsId: string } }>, res: FastifyReply) =>
        uploadBlockImageController.handle(req, res),
    );
}