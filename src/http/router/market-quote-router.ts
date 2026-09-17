import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createMarketQuoteAdapter } from '../../adapter/database/market-quote-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { ListMarketQuotesUseCase } from '../../usecase/list-market-quotes.js';
import { SaveDailyQuotesUseCase } from '../../usecase/save-daily-quotes.js';
import { MarketQuoteController } from '../controllers/market-quote-controller.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse } from '../lib/swagger-schemas.js';
import { ListQuoteHistoryUseCase } from '../../usecase/list-quote-history.js';
import { UpdateQuotesSourceUseCase } from '../../usecase/update-site-settings.js';
import { createSiteSettingsAdapter } from '../../adapter/database/site-settings-adapter.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

const marketQuoteProperties = {
    id: { type: 'string' },
    label: { type: 'string' },
    value: { type: 'string',
description: 'Texto pronto, ex.: "R$ 120,00 /sc 60kg" (vazio antes do 1º lançamento)' },
    priceCents: { type: 'integer',
nullable: true },
    unit: { type: 'string',
nullable: true,
description: 'Unidade fixa do produto (sc 60kg, t…); null no dólar' },
    period: { type: 'string',
nullable: true,
description: 'MORNING (manhã) | AFTERNOON (tarde)' },
    variation: { type: 'string',
nullable: true },
    referenceDate: { type: 'string',
nullable: true },
    isActive: { type: 'boolean' },
    order: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

const quoteList = { type: 'array',
items: { type: 'object',
properties: marketQuoteProperties } };

export async function marketQuoteRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createMarketQuoteAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma));

    const controller = new MarketQuoteController(
        new ListMarketQuotesUseCase(repo),
        new SaveDailyQuotesUseCase(repo),
        getAdminPermissions,
    );

    fastify.get(
        '/market-quotes',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'Cotações da home (público)',
                description: 'Produtos fixos com preço já lançado (soja, milho, trigo, mandioca, dólar), na ordem da home.',
                response: { 200: quoteList },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.listPublic(req, res),
    );

    const history = new ListQuoteHistoryUseCase(repo);
    fastify.get(
        '/market-quotes/history',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'Histórico das cotações (público)',
                description: 'Um ponto por lançamento (dia + manhã/tarde) de cada produto ativo, nos últimos N dias (7 a 365; padrão 90).',
                querystring: { type: 'object',
properties: { days: { type: 'integer',
minimum: 7,
maximum: 365 } } },
                response: {
                    200: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                label: { type: 'string' },
                                unit: { type: 'string',
nullable: true },
                                points: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            date: { type: 'string',
description: 'YYYY-MM-DD' },
                                            period: { type: 'string',
nullable: true },
                                            priceCents: { type: 'integer' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    400: errorResponse,
                },
            },
        },
        async (req: FastifyRequest, reply: FastifyReply) => {
            const r = await history.execute(req.query);
            if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
            return reply.send(r.series);
        },
    );

    fastify.get(
        '/admin/market-quotes',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'Produtos da cotação (admin)',
                security: [{ bearerAuth: [] }],
                response: {
                    200: quoteList,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.listAdmin(req, res),
    );

    fastify.put(
        '/admin/market-quotes/daily',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'Lançar as cotações do dia',
                description: `Grava o preço dos produtos informados no período (manhã/tarde).

- A data de referência é sempre **hoje** (horário de Brasília).
- Produto que não vier no corpo mantém o último preço.
- Relançar o mesmo dia/período substitui o lançamento anterior.
- A variação é calculada contra o lançamento anterior do produto.`,
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['period', 'prices'],
                    properties: {
                        period: { type: 'string',
enum: ['MORNING', 'AFTERNOON'] },
                        prices: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['id', 'priceCents'],
                                properties: {
                                    id: { type: 'string' },
                                    priceCents: { type: 'integer',
example: 12050 },
                                },
                            },
                        },
                    },
                },
                response: {
                    200: quoteList,
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.saveDaily(req, res),
    );

    const updateSource = new UpdateQuotesSourceUseCase(createSiteSettingsAdapter(prisma));
    fastify.put(
        '/admin/market-quotes/source',
        {
            schema: {
                tags: ['Market Quotes'],
                summary: 'Fonte exibida na faixa de cotações (ex.: Cvale)',
                security: [{ bearerAuth: [] }],
                body: { type: 'object',
required: ['source'],
properties: { source: { type: 'string' } } },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        async (req: FastifyRequest, reply: FastifyReply) => {
            if ((await requirePermission(req, reply, 'UPDATE_MARKET_QUOTE', getAdminPermissions)) === null) return;
            const r = await updateSource.execute(req.body);
            if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
            return reply.send({ message: 'ok' });
        },
    );
}
