import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createMarketQuoteAdapter } from '../../adapter/database/market-quote-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { ListMarketQuotesUseCase } from '../../usecase/list-market-quotes.js';
import { CreateMarketQuoteUseCase } from '../../usecase/create-market-quote.js';
import { UpdateMarketQuoteUseCase } from '../../usecase/update-market-quote.js';
import { DeleteMarketQuoteUseCase } from '../../usecase/delete-market-quote.js';
import { MarketQuoteController } from '../controllers/market-quote-controller.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const marketQuoteProperties = {
    id: { type: 'string' },
    label: { type: 'string' },
    value: { type: 'string' },
    variation: { type: 'string',
nullable: true },
    referenceDate: { type: 'string',
nullable: true },
    isActive: { type: 'boolean' },
    order: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

const marketQuoteBody = {
    type: 'object',
    required: ['label', 'value'],
    properties: {
        label: { type: 'string',
example: 'Soja' },
        value: { type: 'string',
example: 'R$ 128,50 /sc 60kg' },
        variation: { type: 'string',
nullable: true,
example: '+1,2%' },
        referenceDate: { type: 'string',
nullable: true,
example: '2026-09-01' },
        isActive: { type: 'boolean' },
        order: { type: 'integer' },
    },
};

export async function marketQuoteRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createMarketQuoteAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const controller = new MarketQuoteController(
        new ListMarketQuotesUseCase(repo),
        new CreateMarketQuoteUseCase(repo),
        new UpdateMarketQuoteUseCase(repo),
        new DeleteMarketQuoteUseCase(repo),
        getAdminPermissions,
    );

    fastify.get(
        '/market-quotes',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'List active market quotes (public)',
                description: 'Cotações ativas (dólar, soja, milho…) exibidas na home, ordenadas.',
                response: {
                    200: { type: 'array',
items: { type: 'object',
properties: marketQuoteProperties } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.listPublic(req, res),
    );

    fastify.get(
        '/admin/market-quotes',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'List all market quotes (admin)',
                security: [{ bearerAuth: [] }],
                response: {
                    200: { type: 'array',
items: { type: 'object',
properties: marketQuoteProperties } },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.listAdmin(req, res),
    );

    fastify.post(
        '/market-quotes',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'Create market quote',
                security: [{ bearerAuth: [] }],
                body: marketQuoteBody,
                response: {
                    201: { type: 'object',
properties: marketQuoteProperties },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.create(req, res),
    );

    fastify.patch(
        '/market-quotes/:id',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'Update market quote',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } },
                },
                body: { type: 'object',
properties: marketQuoteBody.properties },
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
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.update(req, res),
    );

    fastify.delete(
        '/market-quotes/:id',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'Delete market quote',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } },
                },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.remove(req, res),
    );
}
