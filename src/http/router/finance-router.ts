import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createFinanceAdapter } from '../../adapter/database/finance-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { ListFinanceCategoriesUseCase } from '../../usecase/list-finance-categories.js';
import { CreateFinanceCategoryUseCase } from '../../usecase/create-finance-category.js';
import { UpdateFinanceCategoryUseCase } from '../../usecase/update-finance-category.js';
import { DeleteFinanceCategoryUseCase } from '../../usecase/delete-finance-category.js';
import { ListFinanceAccountsUseCase } from '../../usecase/list-finance-accounts.js';
import { CreateFinanceAccountUseCase } from '../../usecase/create-finance-account.js';
import { UpdateFinanceAccountUseCase } from '../../usecase/update-finance-account.js';
import { DeleteFinanceAccountUseCase } from '../../usecase/delete-finance-account.js';
import { ListFinanceTransactionsUseCase } from '../../usecase/list-finance-transactions.js';
import { CreateFinanceTransactionUseCase } from '../../usecase/create-finance-transaction.js';
import { UpdateFinanceTransactionUseCase } from '../../usecase/update-finance-transaction.js';
import { DeleteFinanceTransactionUseCase } from '../../usecase/delete-finance-transaction.js';
import { CreateFinanceTransferUseCase } from '../../usecase/create-finance-transfer.js';
import { FinanceSummaryUseCase } from '../../usecase/finance-summary.js';
import { ExportFinanceTransactionsUseCase } from '../../usecase/export-finance-transactions.js';
import { UploadFinanceAttachmentUseCase } from '../../usecase/upload-finance-attachment.js';
import { GetFinanceAttachmentUseCase } from '../../usecase/get-finance-attachment.js';
import { DeleteFinanceAttachmentUseCase } from '../../usecase/delete-finance-attachment.js';
import {
    ListFinanceRecurrencesUseCase,
    CreateFinanceRecurrenceUseCase,
    UpdateFinanceRecurrenceUseCase,
    DeleteFinanceRecurrenceUseCase,
    GenerateFinanceRecurrencesUseCase,
} from '../../usecase/finance-recurrences.js';
import {
    ListFinancePaymentMethodsUseCase,
    CreateFinancePaymentMethodUseCase,
    UpdateFinancePaymentMethodUseCase,
    DeleteFinancePaymentMethodUseCase,
} from '../../usecase/finance-payment-methods.js';
import {
    ListFinanceClosingsUseCase,
    PreviewFinanceClosingUseCase,
    CreateFinanceClosingUseCase,
    DeleteFinanceClosingUseCase,
} from '../../usecase/finance-closings.js';
import { FinanceController } from '../controllers/finance-controller.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const categoryProperties = {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string',
enum: ['IN', 'OUT'] },
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
        name: { type: 'string',
example: 'Material de escritório' },
        type: { type: 'string',
enum: ['IN', 'OUT'],
example: 'OUT' },
        color: { type: 'string',
example: '#ea580c' },
        active: { type: 'boolean' },
        order: { type: 'integer' },
    },
};

const accountProperties = {
    id: { type: 'string' },
    name: { type: 'string' },
    color: { type: 'string' },
    active: { type: 'boolean' },
    order: { type: 'integer' },
    isDeleted: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

const accountBody = {
    type: 'object',
    required: ['name'],
    properties: {
        name: { type: 'string',
example: 'Banco' },
        color: { type: 'string',
example: '#2563eb' },
        active: { type: 'boolean' },
        order: { type: 'integer' },
    },
};

const transactionBody = {
    type: 'object',
    required: ['amountCents', 'date', 'description'],
    properties: {
        // null/ausente = "só nota" (gera a Nota de Empenho sem lançar no caixa).
        type: { type: ['string', 'null'],
enum: ['IN', 'OUT', null],
example: 'OUT' },
        amountCents: { type: 'integer',
minimum: 1,
example: 12500,
description: 'Valor em centavos' },
        date: { type: 'string',
example: '2026-09-01' },
        description: { type: 'string',
example: 'Compra de material' },
        method: { type: 'string',
nullable: true,
example: 'PIX' },
        notes: { type: 'string',
nullable: true },
        categoryId: { type: 'string',
nullable: true },
        accountId: { type: 'string',
nullable: true },
        empenho: { type: 'object',
additionalProperties: true,
nullable: true },
    },
};

// Recorrência: molde do lançamento que se repete todo mês. Meses em "AAAA-MM".
const recurrenceBody = {
    type: 'object',
    required: ['type', 'description', 'amountCents', 'dayOfMonth', 'startMonth'],
    properties: {
        type: { type: 'string',
enum: ['IN', 'OUT'],
example: 'OUT' },
        description: { type: 'string',
example: 'Aluguel da sede' },
        amountCents: { type: 'integer',
minimum: 1,
example: 250000,
description: 'Valor em centavos' },
        dayOfMonth: { type: 'integer',
minimum: 1,
maximum: 31,
example: 10,
description: 'Mês mais curto usa o último dia dele' },
        startMonth: { type: 'string',
example: '2026-01' },
        endMonth: { type: 'string',
nullable: true,
example: '2026-12' },
        paymentMethod: { type: 'string',
nullable: true,
example: 'PIX' },
        notes: { type: 'string',
nullable: true },
        categoryId: { type: 'string',
nullable: true },
        accountId: { type: 'string',
nullable: true },
        active: { type: 'boolean' },
    },
};

const paymentMethodProperties = {
    id: { type: 'string' },
    name: { type: 'string' },
    active: { type: 'boolean' },
    order: { type: 'integer' },
    isDeleted: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

const paymentMethodBody = {
    type: 'object',
    required: ['name'],
    properties: {
        name: { type: 'string',
example: 'PIX' },
        active: { type: 'boolean' },
        order: { type: 'integer' },
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
        new ListFinanceAccountsUseCase(repo),
        new CreateFinanceAccountUseCase(repo),
        new UpdateFinanceAccountUseCase(repo),
        new DeleteFinanceAccountUseCase(repo),
        new ListFinanceTransactionsUseCase(repo),
        new CreateFinanceTransactionUseCase(repo),
        new UpdateFinanceTransactionUseCase(repo),
        new DeleteFinanceTransactionUseCase(repo),
        new CreateFinanceTransferUseCase(repo),
        new FinanceSummaryUseCase(repo),
        new ExportFinanceTransactionsUseCase(repo),
        new UploadFinanceAttachmentUseCase(repo),
        new GetFinanceAttachmentUseCase(repo),
        new DeleteFinanceAttachmentUseCase(repo),
        new ListFinanceRecurrencesUseCase(repo),
        new CreateFinanceRecurrenceUseCase(repo),
        new UpdateFinanceRecurrenceUseCase(repo),
        new DeleteFinanceRecurrenceUseCase(repo),
        new GenerateFinanceRecurrencesUseCase(repo),
        new ListFinancePaymentMethodsUseCase(repo),
        new CreateFinancePaymentMethodUseCase(repo),
        new UpdateFinancePaymentMethodUseCase(repo),
        new DeleteFinancePaymentMethodUseCase(repo),
        new ListFinanceClosingsUseCase(repo),
        new PreviewFinanceClosingUseCase(repo),
        new CreateFinanceClosingUseCase(repo),
        new DeleteFinanceClosingUseCase(repo),
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
                querystring: { type: 'object',
properties: { all: { type: 'string',
enum: ['true', 'false'] } } },
                response: {
                    200: { type: 'array',
items: { type: 'object',
properties: categoryProperties } },
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
                    201: { type: 'object',
properties: categoryProperties },
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
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                body: { type: 'object',
properties: categoryBody.properties },
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
            controller.patchCategory(req, res),
    );

    fastify.delete(
        '/admin/finance/categories/:id',
        {
            schema: {
                tags,
                summary: 'Delete (soft) financial category',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
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

    // ── Contas / caixas ─────────────────────────────────────────────────────
    fastify.get(
        '/admin/finance/accounts',
        {
            schema: {
                tags,
                summary: 'List cash accounts',
                description: 'Contas ativas. Use ?all=true para incluir inativas (gestão).',
                security: sec,
                querystring: { type: 'object',
properties: { all: { type: 'string',
enum: ['true', 'false'] } } },
                response: {
                    200: { type: 'array',
items: { type: 'object',
properties: accountProperties } },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Querystring: { all?: string } }>, res: FastifyReply) =>
            controller.getAccounts(req, res),
    );

    fastify.post(
        '/admin/finance/accounts',
        {
            schema: {
                tags,
                summary: 'Create cash account',
                security: sec,
                body: accountBody,
                response: {
                    201: { type: 'object',
properties: accountProperties },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.postAccount(req, res),
    );

    fastify.patch(
        '/admin/finance/accounts/:id',
        {
            schema: {
                tags,
                summary: 'Update cash account',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                body: { type: 'object',
properties: accountBody.properties },
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
            controller.patchAccount(req, res),
    );

    fastify.delete(
        '/admin/finance/accounts/:id',
        {
            schema: {
                tags,
                summary: 'Delete (soft) cash account',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.removeAccount(req, res),
    );

    // ── Lançamentos ─────────────────────────────────────────────────────────
    fastify.get(
        '/admin/finance/transactions',
        {
            schema: {
                tags,
                summary: 'List financial transactions',
                description: 'Paginado, com filtros: from, to, type, categoryId, accountId, search. `totals` soma entradas e saídas de todos os lançamentos filtrados (sem transferências entre caixas nem "só nota").',
                security: sec,
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
                        from: { type: 'string' },
                        to: { type: 'string' },
                        type: { type: 'string',
enum: ['IN', 'OUT'] },
                        categoryId: { type: 'string' },
                        accountId: { type: 'string' },
                        method: { type: 'string',
example: 'PIX' },
                        search: { type: 'string' },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            // Lançamento com categoria, caixa, empenho e comprovantes: vai inteiro.
                            data: { type: 'array',
items: { type: 'object',
additionalProperties: true } },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            totalPages: { type: 'integer' },
                            totals: {
                                type: 'object',
                                properties: {
                                    incomeCents: { type: 'integer' },
                                    expenseCents: { type: 'integer' },
                                },
                            },
                        },
                    },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getTransactions(req, res),
    );

    fastify.get(
        '/admin/finance/transactions/export',
        {
            schema: {
                tags,
                summary: 'Export transactions as CSV',
                description: 'CSV (;) dos lançamentos que batem com os filtros (from, to, type, categoryId, accountId, method, search).',
                security: sec,
                querystring: {
                    type: 'object',
                    properties: {
                        from: { type: 'string' },
                        to: { type: 'string' },
                        type: { type: 'string',
enum: ['IN', 'OUT'] },
                        categoryId: { type: 'string' },
                        accountId: { type: 'string' },
                        method: { type: 'string' },
                        search: { type: 'string' },
                    },
                },
                response: { 401: errorResponse,
403: errorResponse },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.exportTransactions(req, res),
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

    fastify.post(
        '/admin/finance/transfers',
        {
            schema: {
                tags,
                summary: 'Transfer between cash accounts',
                description: 'Cria 2 lançamentos ligados (saída na origem, entrada no destino). Não conta como receita/despesa.',
                security: sec,
                body: {
                    type: 'object',
                    required: ['fromAccountId', 'toAccountId', 'amountCents', 'date'],
                    properties: {
                        fromAccountId: { type: 'string' },
                        toAccountId: { type: 'string' },
                        amountCents: { type: 'integer',
minimum: 1 },
                        date: { type: 'string',
example: '2026-09-01' },
                        description: { type: 'string',
nullable: true },
                        method: { type: 'string',
nullable: true },
                    },
                },
                response: {
                    201: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.postTransfer(req, res),
    );

    fastify.patch(
        '/admin/finance/transactions/:id',
        {
            schema: {
                tags,
                summary: 'Update financial transaction',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                body: { type: 'object',
properties: transactionBody.properties },
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
            controller.patchTransaction(req, res),
    );

    fastify.delete(
        '/admin/finance/transactions/:id',
        {
            schema: {
                tags,
                summary: 'Delete (soft) financial transaction',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
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
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
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
                params: { type: 'object',
required: ['attachmentId'],
properties: { attachmentId: { type: 'string' } } },
                response: { 401: errorResponse,
403: errorResponse,
404: errorResponse },
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
                params: { type: 'object',
required: ['attachmentId'],
properties: { attachmentId: { type: 'string' } } },
                response: { 204: { type: 'null' },
401: errorResponse,
403: errorResponse,
404: errorResponse },
            },
        },
        (req: FastifyRequest<{ Params: { attachmentId: string } }>, res: FastifyReply) =>
            controller.removeAttachment(req, res),
    );

    // ── Recorrentes ─────────────────────────────────────────────────────────
    fastify.get(
        '/admin/finance/recurrences',
        {
            schema: {
                tags,
                summary: 'List recurring transactions',
                description: 'Recorrências ativas. Use ?all=true para incluir as pausadas.',
                security: sec,
                querystring: { type: 'object',
properties: { all: { type: 'string',
enum: ['true', 'false'] } } },
                response: {
                    200: { type: 'array',
items: { type: 'object',
additionalProperties: true } },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Querystring: { all?: string } }>, res: FastifyReply) =>
            controller.getRecurrences(req, res),
    );

    fastify.post(
        '/admin/finance/recurrences',
        {
            schema: {
                tags,
                summary: 'Create recurring transaction',
                description: 'Molde do lançamento que se repete todo mês. Meses em "AAAA-MM".',
                security: sec,
                body: recurrenceBody,
                response: {
                    201: { type: 'object',
additionalProperties: true },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.postRecurrence(req, res),
    );

    fastify.patch(
        '/admin/finance/recurrences/:id',
        {
            schema: {
                tags,
                summary: 'Update recurring transaction',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                body: { type: 'object',
properties: recurrenceBody.properties },
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
            controller.patchRecurrence(req, res),
    );

    fastify.delete(
        '/admin/finance/recurrences/:id',
        {
            schema: {
                tags,
                summary: 'Delete (soft) recurring transaction',
                description: 'Some só o molde: os lançamentos já gerados continuam no caixa.',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.removeRecurrence(req, res),
    );

    fastify.post(
        '/admin/finance/recurrences/generate',
        {
            schema: {
                tags,
                summary: 'Generate missing recurring entries',
                description: 'Cria os lançamentos que faltam de cada recorrência ativa, até o mês atual. Idempotente: o mesmo mês nunca é gerado duas vezes.',
                security: sec,
                response: {
                    200: { type: 'object',
properties: { created: { type: 'integer' } } },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.postGenerateRecurrences(req, res),
    );

    // ── Formas de pagamento ─────────────────────────────────────────────────
    fastify.get(
        '/admin/finance/payment-methods',
        {
            schema: {
                tags,
                summary: 'List payment methods',
                description: 'Formas de pagamento cadastradas (PIX, DINHEIRO…). ?all=true inclui as inativas.',
                security: sec,
                querystring: { type: 'object',
properties: { all: { type: 'string',
enum: ['true', 'false'] } } },
                response: {
                    200: { type: 'array',
items: { type: 'object',
properties: paymentMethodProperties } },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Querystring: { all?: string } }>, res: FastifyReply) =>
            controller.getPaymentMethods(req, res),
    );

    fastify.post(
        '/admin/finance/payment-methods',
        {
            schema: {
                tags,
                summary: 'Create payment method',
                description: 'O nome é gravado em caixa alta e sem espaços extras; repetido → 409.',
                security: sec,
                body: paymentMethodBody,
                response: {
                    201: { type: 'object',
properties: paymentMethodProperties },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.postPaymentMethod(req, res),
    );

    fastify.patch(
        '/admin/finance/payment-methods/:id',
        {
            schema: {
                tags,
                summary: 'Update payment method',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                body: { type: 'object',
properties: paymentMethodBody.properties },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.patchPaymentMethod(req, res),
    );

    fastify.delete(
        '/admin/finance/payment-methods/:id',
        {
            schema: {
                tags,
                summary: 'Delete (soft) payment method',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.removePaymentMethod(req, res),
    );

    // ── Fechamento mensal ───────────────────────────────────────────────────
    fastify.get(
        '/admin/finance/closings',
        {
            schema: {
                tags,
                summary: 'List monthly closings',
                security: sec,
                querystring: {
                    type: 'object',
                    properties: { accountId: { type: 'string' },
year: { type: 'string',
example: '2026' } },
                },
                response: {
                    200: { type: 'array',
items: { type: 'object',
additionalProperties: true } },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getClosings(req, res),
    );

    fastify.get(
        '/admin/finance/closings/preview',
        {
            schema: {
                tags,
                summary: 'Preview a monthly closing',
                description: 'Saldo de abertura + entradas/saídas do mês = saldo esperado do caixa. Não grava nada.',
                security: sec,
                querystring: {
                    type: 'object',
                    required: ['accountId', 'month'],
                    properties: { accountId: { type: 'string' },
month: { type: 'string',
example: '2026-09' } },
                },
                response: {
                    200: { type: 'object',
additionalProperties: true },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getClosingPreview(req, res),
    );

    fastify.post(
        '/admin/finance/closings',
        {
            schema: {
                tags,
                summary: 'Close a month for a cash account',
                description: 'O saldo esperado é recalculado no servidor; o corpo só traz o saldo contado.',
                security: sec,
                body: {
                    type: 'object',
                    required: ['accountId', 'month', 'countedBalanceCents'],
                    properties: {
                        accountId: { type: 'string' },
                        month: { type: 'string',
example: '2026-09' },
                        countedBalanceCents: { type: 'integer',
description: 'Saldo contado, em centavos' },
                        notes: { type: 'string',
nullable: true },
                    },
                },
                response: {
                    201: { type: 'object',
additionalProperties: true },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.postClosing(req, res),
    );

    fastify.delete(
        '/admin/finance/closings/:id',
        {
            schema: {
                tags,
                summary: 'Reopen a closed month',
                security: sec,
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.removeClosing(req, res),
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
                    properties: { from: { type: 'string' },
to: { type: 'string' } },
                },
                response: { 401: errorResponse,
403: errorResponse },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getSummary(req, res),
    );
}
