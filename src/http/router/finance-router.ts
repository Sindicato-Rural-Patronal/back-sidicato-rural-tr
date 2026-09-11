import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createFinanceAdapter } from '../../adapter/database/finance-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { ListFinanceCategoriesUseCase } from '../../usecase/list-finance-categories.js';
import { CreateFinanceCategoryUseCase } from '../../usecase/create-finance-category.js';
import { UpdateFinanceCategoryUseCase } from '../../usecase/update-finance-category.js';
import { DeleteFinanceCategoryUseCase } from '../../usecase/delete-finance-category.js';
import { ListFinanceTransactionsUseCase } from '../../usecase/list-finance-transactions.js';
import { CreateFinanceTransactionUseCase } from '../../usecase/create-finance-transaction.js';
import { UpdateFinanceTransactionUseCase } from '../../usecase/update-finance-transaction.js';
import { DeleteFinanceTransactionUseCase } from '../../usecase/delete-finance-transaction.js';
import { FinanceSummaryUseCase } from '../../usecase/finance-summary.js';
import { UploadFinanceAttachmentUseCase } from '../../usecase/upload-finance-attachment.js';
import { GetFinanceAttachmentUseCase } from '../../usecase/get-finance-attachment.js';
import { DeleteFinanceAttachmentUseCase } from '../../usecase/delete-finance-attachment.js';
import { FinanceController } from '../controllers/finance-controller.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const categoryProperties = {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['IN', 'OUT'] },
    color: { type: 'string' },
    active: { type: 'boolean' },
    order: { type: 'integer' },
    isDeleted: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

const categoryBody = {
    type: 'object',
    required: ['name', 'type'],
    properties: {
        name: { type: 'string', example: 'Material de escritório' },
        type: { type: 'string', enum: ['IN', 'OUT'], example: 'OUT' },
        color: { type: 'string', example: '#ea580c' },
        active: { type: 'boolean' },
        order: { type: 'integer' },
    },
};

const transactionBody = {
    type: 'object',
    required: ['type', 'amountCents', 'date', 'description'],
    properties: {
        type: { type: 'string', enum: ['IN', 'OUT'], example: 'OUT' },
        amountCents: { type: 'integer', minimum: 1, example: 12500, description: 'Valor em centavos' },
        date: { type: 'string', example: '2026-09-01' },
        description: { type: 'string', example: 'Compra de material' },
        method: { type: 'string', nullable: true, example: 'PIX' },
        notes: { type: 'string', nullable: true },
        categoryId: { type: 'string', nullable: true },
    },
};

export async function financeRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createFinanceAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const controller = new FinanceController(
        new ListFinanceCategoriesUseCase(repo),
        new CreateFinanceCategoryUseCase(repo),
        new UpdateFinanceCategoryUseCase(repo),
        new DeleteFinanceCategoryUseCase(repo),
        new ListFinanceTransactionsUseCase(repo),
        new CreateFinanceTransactionUseCase(repo),
        new UpdateFinanceTransactionUseCase(repo),
        new DeleteFinanceTransactionUseCase(repo),
        new FinanceSummaryUseCase(repo),
        new UploadFinanceAttachmentUseCase(repo),
        new GetFinanceAttachmentUseCase(repo),
        new DeleteFinanceAttachmentUseCase(repo),
        getAdminPermissions,
    );

    const tags = ['Finance'];
    const sec = [{ bearerAuth: [] }];

    // ── Categorias ──────────────────────────────────────────────────────────
    fastify.get(
        '/admin/finance/categories',
        {
            schema: {
                tags,
                summary: 'List financial categories',
                description: 'Categorias ativas. Use ?all=true para incluir inativas (gestão).',
                security: sec,
                querystring: { type: 'object', properties: { all: { type: 'string', enum: ['true', 'false'] } } },
                response: {
                    200: { type: 'array', items: { type: 'object', properties: categoryProperties } },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Querystring: { all?: string } }>, res: FastifyReply) =>
            controller.getCategories(req, res),
    );

    fastify.post(
        '/admin/finance/categories',
        {
            schema: {
                tags,
                summary: 'Create financial category',
                security: sec,
                body: categoryBody,
                response: {
                    201: { type: 'object', properties: categoryProperties },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.postCategory(req, res),
    );

    fastify.patch(
        '/admin/finance/categories/:id',
        {
            schema: {
                tags,
                summary: 'Update financial category',
                security: sec,
                params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
                body: { type: 'object', properties: categoryBody.properties },
                response: {
                    200: { type: 'object', properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.patchCategory(req, res),
    );

    fastify.delete(
        '/admin/finance/categories/:id',
        {
            schema: {
                tags,
                summary: 'Delete (soft) financial category',
                security: sec,
                params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.removeCategory(req, res),
    );

    // ── Lançamentos ─────────────────────────────────────────────────────────
    fastify.get(
        '/admin/finance/transactions',
        {
            schema: {
                tags,
                summary: 'List financial transactions',
                description: 'Paginado, com filtros: from, to, type, categoryId, search.',
                security: sec,
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
                        from: { type: 'string' },
                        to: { type: 'string' },
                        type: { type: 'string', enum: ['IN', 'OUT'] },
                        categoryId: { type: 'string' },
                        search: { type: 'string' },
                    },
                },
                response: { 401: errorResponse, 403: errorResponse },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getTransactions(req, res),
    );

    fastify.post(
        '/admin/finance/transactions',
        {
            schema: {
                tags,
                summary: 'Create financial transaction',
                security: sec,
                body: transactionBody,
                response: {
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.postTransaction(req, res),
    );

    fastify.patch(
        '/admin/finance/transactions/:id',
        {
            schema: {
                tags,
                summary: 'Update financial transaction',
                security: sec,
                params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
                body: { type: 'object', properties: transactionBody.properties },
                response: {
                    200: { type: 'object', properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.patchTransaction(req, res),
    );

    fastify.delete(
        '/admin/finance/transactions/:id',
        {
            schema: {
                tags,
                summary: 'Delete (soft) financial transaction',
                security: sec,
                params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.removeTransaction(req, res),
    );

    // ── Comprovantes (anexos) ─────────────────────────────────────────────────
    fastify.post(
        '/admin/finance/transactions/:id/attachments',
        {
            schema: {
                tags,
                summary: 'Attach a receipt (PDF/image) to a transaction',
                description: 'multipart/form-data com o arquivo no campo "file". Máx 15MB. PDF, JPG, PNG ou WEBP.',
                security: sec,
                consumes: ['multipart/form-data'],
                params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
                response: {
                    201: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            filename: { type: 'string' },
                            mimeType: { type: 'string' },
                            size: { type: 'integer' },
                            createdAt: { type: 'string' },
                        },
                    },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.uploadAttachment(req, res),
    );

    fastify.get(
        '/admin/finance/attachments/:attachmentId',
        {
            schema: {
                tags,
                summary: 'Download a transaction receipt (inline)',
                security: sec,
                params: { type: 'object', required: ['attachmentId'], properties: { attachmentId: { type: 'string' } } },
                response: { 401: errorResponse, 403: errorResponse, 404: errorResponse },
            },
        },
        (req: FastifyRequest<{ Params: { attachmentId: string } }>, res: FastifyReply) =>
            controller.downloadAttachment(req, res),
    );

    fastify.delete(
        '/admin/finance/attachments/:attachmentId',
        {
            schema: {
                tags,
                summary: 'Remove a transaction receipt',
                security: sec,
                params: { type: 'object', required: ['attachmentId'], properties: { attachmentId: { type: 'string' } } },
                response: { 204: { type: 'null' }, 401: errorResponse, 403: errorResponse, 404: errorResponse },
            },
        },
        (req: FastifyRequest<{ Params: { attachmentId: string } }>, res: FastifyReply) =>
            controller.removeAttachment(req, res),
    );

    // ── Dashboard ───────────────────────────────────────────────────────────
    fastify.get(
        '/admin/finance/summary',
        {
            schema: {
                tags,
                summary: 'Financial summary (KPIs + charts)',
                description: 'Saldo acumulado + entradas/saídas do período, por categoria e por mês.',
                security: sec,
                querystring: {
                    type: 'object',
                    properties: { from: { type: 'string' }, to: { type: 'string' } },
                },
                response: { 401: errorResponse, 403: errorResponse },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getSummary(req, res),
    );
}
