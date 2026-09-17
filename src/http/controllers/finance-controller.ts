import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListFinanceCategoriesUseCase } from '../../usecase/list-finance-categories.js';
import type { CreateFinanceCategoryUseCase } from '../../usecase/create-finance-category.js';
import type { UpdateFinanceCategoryUseCase } from '../../usecase/update-finance-category.js';
import type { DeleteFinanceCategoryUseCase } from '../../usecase/delete-finance-category.js';
import type { ListFinanceAccountsUseCase } from '../../usecase/list-finance-accounts.js';
import type { CreateFinanceAccountUseCase } from '../../usecase/create-finance-account.js';
import type { UpdateFinanceAccountUseCase } from '../../usecase/update-finance-account.js';
import type { DeleteFinanceAccountUseCase } from '../../usecase/delete-finance-account.js';
import type { ListFinanceTransactionsUseCase } from '../../usecase/list-finance-transactions.js';
import type { CreateFinanceTransactionUseCase } from '../../usecase/create-finance-transaction.js';
import type { UpdateFinanceTransactionUseCase } from '../../usecase/update-finance-transaction.js';
import type { DeleteFinanceTransactionUseCase } from '../../usecase/delete-finance-transaction.js';
import type { CreateFinanceTransferUseCase } from '../../usecase/create-finance-transfer.js';
import type { FinanceSummaryUseCase } from '../../usecase/finance-summary.js';
import type { ExportFinanceTransactionsUseCase } from '../../usecase/export-finance-transactions.js';
import type { UploadFinanceAttachmentUseCase } from '../../usecase/upload-finance-attachment.js';
import type { GetFinanceAttachmentUseCase } from '../../usecase/get-finance-attachment.js';
import type { DeleteFinanceAttachmentUseCase } from '../../usecase/delete-finance-attachment.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type IdParams = { id: string };

export class FinanceController {
    constructor(
        private readonly listCategories: ListFinanceCategoriesUseCase,
        private readonly createCategory: CreateFinanceCategoryUseCase,
        private readonly updateCategory: UpdateFinanceCategoryUseCase,
        private readonly deleteCategory: DeleteFinanceCategoryUseCase,
        private readonly listAccounts: ListFinanceAccountsUseCase,
        private readonly createAccount: CreateFinanceAccountUseCase,
        private readonly updateAccount: UpdateFinanceAccountUseCase,
        private readonly deleteAccount: DeleteFinanceAccountUseCase,
        private readonly listTransactions: ListFinanceTransactionsUseCase,
        private readonly createTransaction: CreateFinanceTransactionUseCase,
        private readonly updateTransaction: UpdateFinanceTransactionUseCase,
        private readonly deleteTransaction: DeleteFinanceTransactionUseCase,
        private readonly createTransfer: CreateFinanceTransferUseCase,
        private readonly summaryUseCase: FinanceSummaryUseCase,
        private readonly exportUseCase: ExportFinanceTransactionsUseCase,
        private readonly uploadAttachmentUseCase: UploadFinanceAttachmentUseCase,
        private readonly getAttachmentUseCase: GetFinanceAttachmentUseCase,
        private readonly deleteAttachmentUseCase: DeleteFinanceAttachmentUseCase,
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

    // ── Contas / caixas ─────────────────────────────────────────────────────
    async getAccounts(request: FastifyRequest<{ Querystring: { all?: string } }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_FINANCE', this.getAdminPermissions)) === null) return;
        const includeInactive = request.query.all === 'true';
        return reply.send(await this.listAccounts.execute(includeInactive));
    }

    async postAccount(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'CREATE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.createAccount.execute(request.body);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(201).send(res.account);
    }

    async patchAccount(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.updateAccount.execute(request.params.id, request.body);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(200).send({ message: 'ok' });
    }

    async removeAccount(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'DELETE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.deleteAccount.execute(request.params.id);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(204).send();
    }

    // ── Lançamentos ─────────────────────────────────────────────────────────
    async getTransactions(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_FINANCE', this.getAdminPermissions)) === null) return;
        return reply.send(await this.listTransactions.execute(request.query));
    }

    async exportTransactions(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_FINANCE', this.getAdminPermissions)) === null) return;
        const csv = await this.exportUseCase.execute(request.query);
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="lancamentos.csv"');
        // toCsv já inclui o BOM (acentos no Excel).
        return reply.send(csv);
    }

    async postTransaction(request: FastifyRequest, reply: FastifyReply) {
        const actorId = await requirePermission(request, reply, 'CREATE_FINANCE', this.getAdminPermissions);
        if (actorId === null) return;
        const res = await this.createTransaction.execute(request.body, actorId);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(201).send(res.transaction);
    }

    async postTransfer(request: FastifyRequest, reply: FastifyReply) {
        const actorId = await requirePermission(request, reply, 'CREATE_FINANCE', this.getAdminPermissions);
        if (actorId === null) return;
        const res = await this.createTransfer.execute(request.body, actorId);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(201).send({ message: 'ok' });
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

    // ── Comprovantes ──────────────────────────────────────────────────────────
    async uploadAttachment(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_FINANCE', this.getAdminPermissions)) === null) return;

        const file = await request.file();
        if (!file) return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });

        const chunks: Buffer[] = [];
        for await (const chunk of file.file) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        if (file.file.truncated) {
            return reply.status(400).send({ error: 'Arquivo excede o limite permitido.' });
        }

        const res = await this.uploadAttachmentUseCase.execute(
            request.params.id,
            buffer,
            file.filename,
            file.mimetype,
        );
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(201).send(res.attachment);
    }

    async downloadAttachment(request: FastifyRequest<{ Params: { attachmentId: string } }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_FINANCE', this.getAdminPermissions)) === null) return;
        const file = await this.getAttachmentUseCase.execute(request.params.attachmentId);
        if (!file) return reply.status(404).send({ error: 'Comprovante não encontrado.' });
        reply.type(file.mimeType);
        reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
        return reply.send(file.data);
    }

    async removeAttachment(request: FastifyRequest<{ Params: { attachmentId: string } }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_FINANCE', this.getAdminPermissions)) === null) return;
        const res = await this.deleteAttachmentUseCase.execute(request.params.attachmentId);
        if (res.error) return reply.status(errorToStatus(res.error)).send({ error: res.error.message });
        return reply.status(204).send();
    }

    // ── Dashboard ───────────────────────────────────────────────────────────
    async getSummary(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_FINANCE', this.getAdminPermissions)) === null) return;
        return reply.send(await this.summaryUseCase.execute(request.query));
    }
}
