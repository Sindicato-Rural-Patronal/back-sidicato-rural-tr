import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListFinanceCategoriesUseCase } from '../../usecase/list-finance-categories.js';
import type { CreateFinanceCategoryUseCase } from '../../usecase/create-finance-category.js';
import type { UpdateFinanceCategoryUseCase } from '../../usecase/update-finance-category.js';
import type { DeleteFinanceCategoryUseCase } from '../../usecase/delete-finance-category.js';
import type { ListFinanceTransactionsUseCase } from '../../usecase/list-finance-transactions.js';
import type { CreateFinanceTransactionUseCase } from '../../usecase/create-finance-transaction.js';
import type { UpdateFinanceTransactionUseCase } from '../../usecase/update-finance-transaction.js';
import type { DeleteFinanceTransactionUseCase } from '../../usecase/delete-finance-transaction.js';
import type { FinanceSummaryUseCase } from '../../usecase/finance-summary.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type IdParams = { id: string };

export class FinanceController {
    constructor(
        private readonly listCategories: ListFinanceCategoriesUseCase,
        private readonly createCategory: CreateFinanceCategoryUseCase,
        private readonly updateCategory: UpdateFinanceCategoryUseCase,
        private readonly deleteCategory: DeleteFinanceCategoryUseCase,
        private readonly listTransactions: ListFinanceTransactionsUseCase,
        private readonly createTransaction: CreateFinanceTransactionUseCase,
        private readonly updateTransaction: UpdateFinanceTransactionUseCase,
        private readonly deleteTransaction: DeleteFinanceTransactionUseCase,
        private readonly summaryUseCase: FinanceSummaryUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    // ── Categorias ──────────────────────────────────────────────────────────
    async getCategories(request: FastifyRequest<{ Querystring: { all?: string } }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_FINANCE', this.getAdminPermissions)) === null) return;
        const includeInactive = request.query.all === 'true';
        return reply.send(await this.listCategories.execute(includeInactive));
    }

    async postCategory(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'CREATE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.createCategory.execute(request.body);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(201).send(res.category);
    }

    async patchCategory(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.updateCategory.execute(request.params.id, request.body);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(200).send({ message: 'ok' });
    }

    async removeCategory(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'DELETE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.deleteCategory.execute(request.params.id);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(204).send();
    }

    // ── Lançamentos ─────────────────────────────────────────────────────────
    async getTransactions(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_FINANCE', this.getAdminPermissions)) === null) return;
        return reply.send(await this.listTransactions.execute(request.query));
    }

    async postTransaction(request: FastifyRequest, reply: FastifyReply) {
        const actorId = await requirePermission(request, reply, 'CREATE_FINANCE', this.getAdminPermissions);
        if (actorId === null) return;
        const res = await this.createTransaction.execute(request.body, actorId);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(201).send(res.transaction);
    }

    async patchTransaction(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.updateTransaction.execute(request.params.id, request.body);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(200).send({ message: 'ok' });
    }

    async removeTransaction(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'DELETE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.deleteTransaction.execute(request.params.id);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(204).send();
    }

    // ── Dashboard ───────────────────────────────────────────────────────────
    async getSummary(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_FINANCE', this.getAdminPermissions)) === null) return;
        return reply.send(await this.summaryUseCase.execute(request.query));
    }
}
