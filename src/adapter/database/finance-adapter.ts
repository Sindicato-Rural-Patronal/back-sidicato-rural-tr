import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client/extension';
import type { FinancialCategoryModel } from '../../generated/prisma/models/FinancialCategory.js';
import type { FinancialTransactionModel } from '../../generated/prisma/models/FinancialTransaction.js';
import type { FinancialAccountModel } from '../../generated/prisma/models/FinancialAccount.js';
import type {
    FinanceRepository,
    FinanceCategoryCreateInput,
    FinanceCategoryUpdateInput,
    FinanceAccountCreateInput,
    FinanceAccountUpdateInput,
    FinanceTransactionCreateInput,
    FinanceTransactionUpdateInput,
    FinanceTransferInput,
    FinanceTransactionFilters,
    FinanceTransactionWithCategory,
    FinanceAttachmentMeta,
    FinanceAttachmentFile,
    FinanceSummary,
} from '../../ports/external/finance-repository.js';

// Só metadados do comprovante — nunca os bytes (`data`) na listagem.
const attachmentMetaSelect = {
    select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
} as const;

export function createFinanceAdapter(prisma: PrismaClient): FinanceRepository {
    return new FinanceAdapter(prisma);
}

class FinanceAdapter implements FinanceRepository {
    constructor(private prisma: PrismaClient) {}

    // ── Categorias ──────────────────────────────────────────────────────────
    listCategories(includeInactive: boolean): Promise<FinancialCategoryModel[]> {
        return this.prisma.financialCategory.findMany({
            where: { isDeleted: false, ...(includeInactive ? {} : { active: true }) },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
        });
    }

    findCategoryById(id: string): Promise<FinancialCategoryModel | null> {
        return this.prisma.financialCategory.findFirst({ where: { id, isDeleted: false } });
    }

    createCategory(data: FinanceCategoryCreateInput): Promise<FinancialCategoryModel> {
        return this.prisma.financialCategory.create({ data });
    }

    updateCategory(id: string, data: FinanceCategoryUpdateInput): Promise<FinancialCategoryModel> {
        return this.prisma.financialCategory.update({ where: { id }, data });
    }

    async softDeleteCategory(id: string): Promise<boolean> {
        const r = await this.prisma.financialCategory.updateMany({
            where: { id, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });
        return r.count === 1;
    }

    // ── Contas / caixas ─────────────────────────────────────────────────────────
    listAccounts(includeInactive: boolean): Promise<FinancialAccountModel[]> {
        return this.prisma.financialAccount.findMany({
            where: { isDeleted: false, ...(includeInactive ? {} : { active: true }) },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
        });
    }

    findAccountById(id: string): Promise<FinancialAccountModel | null> {
        return this.prisma.financialAccount.findFirst({ where: { id, isDeleted: false } });
    }

    createAccount(data: FinanceAccountCreateInput): Promise<FinancialAccountModel> {
        return this.prisma.financialAccount.create({ data });
    }

    updateAccount(id: string, data: FinanceAccountUpdateInput): Promise<FinancialAccountModel> {
        return this.prisma.financialAccount.update({ where: { id }, data });
    }

    async softDeleteAccount(id: string): Promise<boolean> {
        const r = await this.prisma.financialAccount.updateMany({
            where: { id, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });
        return r.count === 1;
    }

    // ── Lançamentos ─────────────────────────────────────────────────────────
    async listTransactions(
        filters: FinanceTransactionFilters,
    ): Promise<{ items: FinanceTransactionWithCategory[]; total: number }> {
        const where = this.buildWhere(filters);
        const [items, total] = await Promise.all([
            this.prisma.financialTransaction.findMany({
                where,
                include: {
                    category: true,
                    account: true,
                    attachments: { ...attachmentMetaSelect, orderBy: { createdAt: 'asc' } },
                },
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
                skip: filters.skip,
                take: filters.take,
            }),
            this.prisma.financialTransaction.count({ where }),
        ]);
        return { items, total };
    }

    listTransactionsForExport(
        filters: Omit<FinanceTransactionFilters, 'skip' | 'take'>,
    ): Promise<FinanceTransactionWithCategory[]> {
        return this.prisma.financialTransaction.findMany({
            where: this.buildWhere(filters),
            include: {
                category: true,
                attachments: { ...attachmentMetaSelect, orderBy: { createdAt: 'asc' } },
            },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        });
    }

    findTransactionById(id: string): Promise<FinancialTransactionModel | null> {
        return this.prisma.financialTransaction.findFirst({ where: { id, isDeleted: false } });
    }

    createTransaction(data: FinanceTransactionCreateInput): Promise<FinancialTransactionModel> {
        return this.prisma.financialTransaction.create({ data });
    }

    updateTransaction(id: string, data: FinanceTransactionUpdateInput): Promise<FinancialTransactionModel> {
        return this.prisma.financialTransaction.update({ where: { id }, data });
    }

    async softDeleteTransaction(id: string): Promise<boolean> {
        const r = await this.prisma.financialTransaction.updateMany({
            where: { id, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });
        return r.count === 1;
    }

    async createTransfer(input: FinanceTransferInput): Promise<void> {
        const transferId = randomUUID();
        const base = {
            transferId,
            amountCents: input.amountCents,
            date: input.date,
            description: input.description,
            method: input.method ?? null,
            createdBy: input.createdBy ?? null,
        };
        await this.prisma.$transaction([
            this.prisma.financialTransaction.create({
                data: { ...base, type: 'OUT', accountId: input.fromAccountId },
            }),
            this.prisma.financialTransaction.create({
                data: { ...base, type: 'IN', accountId: input.toAccountId },
            }),
        ]);
    }

    async softDeleteTransfer(transferId: string): Promise<boolean> {
        const r = await this.prisma.financialTransaction.updateMany({
            where: { transferId, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });
        return r.count > 0;
    }

    // ── Comprovantes ──────────────────────────────────────────────────────────
    async addAttachment(
        transactionId: string,
        data: Buffer,
        filename: string,
        mimeType: string,
        size: number,
    ): Promise<FinanceAttachmentMeta> {
        return this.prisma.financialAttachment.create({
            data: { transactionId, data, filename, mimeType, size },
            ...attachmentMetaSelect,
        });
    }

    async getAttachment(id: string): Promise<FinanceAttachmentFile | null> {
        const row = await this.prisma.financialAttachment.findUnique({ where: { id } });
        if (!row) return null;
        return { data: Buffer.from(row.data), filename: row.filename, mimeType: row.mimeType };
    }

    async deleteAttachment(id: string): Promise<boolean> {
        try {
            await this.prisma.financialAttachment.delete({ where: { id } });
            return true;
        } catch {
            return false;
        }
    }

    // ── Dashboard ───────────────────────────────────────────────────────────
    async summary(from: Date, to: Date): Promise<FinanceSummary> {
        // Saldo histórico (caixa atual) — não respeita o período.
        const [allIn, allOut] = await Promise.all([
            this.prisma.financialTransaction.aggregate({
                where: { isDeleted: false, type: 'IN' },
                _sum: { amountCents: true },
            }),
            this.prisma.financialTransaction.aggregate({
                where: { isDeleted: false, type: 'OUT' },
                _sum: { amountCents: true },
            }),
        ]);
        const balanceAllTimeCents =
            (allIn._sum.amountCents ?? 0) - (allOut._sum.amountCents ?? 0);

        // Saldo acumulado por conta/caixa (todas as datas).
        const [accounts, grouped] = await Promise.all([
            this.prisma.financialAccount.findMany({
                where: { isDeleted: false },
                orderBy: [{ order: 'asc' }, { name: 'asc' }],
            }),
            this.prisma.financialTransaction.groupBy({
                by: ['accountId', 'type'],
                where: { isDeleted: false },
                _sum: { amountCents: true },
            }),
        ]);
        const acctBal = new Map<string, number>();
        for (const g of grouped) {
            const key = g.accountId ?? '__none';
            const delta = (g._sum.amountCents ?? 0) * (g.type === 'IN' ? 1 : -1);
            acctBal.set(key, (acctBal.get(key) ?? 0) + delta);
        }
        const byAccount = (accounts as FinancialAccountModel[]).map(a => ({
            accountId: a.id as string | null,
            name: a.name,
            color: a.color,
            balanceCents: acctBal.get(a.id) ?? 0,
        }));
        const noneBal = acctBal.get('__none') ?? 0;
        if (noneBal !== 0) {
            byAccount.push({ accountId: null, name: 'Sem caixa', color: '#94a3b8', balanceCents: noneBal });
        }

        // Lançamentos do período → agregações em JS (volume pequeno).
        const rows = await this.prisma.financialTransaction.findMany({
            where: { isDeleted: false, date: { gte: from, lte: to } },
            include: { category: true },
        });

        let periodInCents = 0;
        let periodOutCents = 0;
        const catMap = new Map<
            string,
            { categoryId: string | null; name: string; color: string; type: 'IN' | 'OUT'; totalCents: number }
        >();
        const monthMap = new Map<string, { inCents: number; outCents: number }>();

        for (const t of rows) {
            // Transferências entre caixas não são receita/despesa — fora dos KPIs,
            // categorias e gráfico mensal (mas contam no saldo por caixa, via groupBy).
            if (t.transferId) continue;
            if (t.type === 'IN') periodInCents += t.amountCents;
            else periodOutCents += t.amountCents;

            const catKey = t.categoryId ?? `__none_${t.type}`;
            const existing = catMap.get(catKey);
            if (existing) {
                existing.totalCents += t.amountCents;
            } else {
                catMap.set(catKey, {
                    categoryId: t.categoryId,
                    name: t.category?.name ?? 'Sem categoria',
                    color: t.category?.color ?? '#94a3b8',
                    type: t.type,
                    totalCents: t.amountCents,
                });
            }

            const month = t.date.toISOString().slice(0, 7); // YYYY-MM
            const m = monthMap.get(month) ?? { inCents: 0, outCents: 0 };
            if (t.type === 'IN') m.inCents += t.amountCents;
            else m.outCents += t.amountCents;
            monthMap.set(month, m);
        }

        const byCategory = [...catMap.values()].sort((a, b) => b.totalCents - a.totalCents);
        const byMonth = [...monthMap.entries()]
            .map(([month, v]) => ({ month, ...v }))
            .sort((a, b) => a.month.localeCompare(b.month));

        return {
            balanceAllTimeCents,
            periodInCents,
            periodOutCents,
            periodResultCents: periodInCents - periodOutCents,
            byCategory,
            byMonth,
            byAccount,
        };
    }

    private buildWhere(filters: Omit<FinanceTransactionFilters, 'skip' | 'take'>) {
        const where: Record<string, unknown> = { isDeleted: false };
        if (filters.type) where.type = filters.type;
        if (filters.categoryId) where.categoryId = filters.categoryId;
        if (filters.accountId) where.accountId = filters.accountId;
        if (filters.from || filters.to) {
            where.date = {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
            };
        }
        if (filters.search) {
            where.description = { contains: filters.search, mode: 'insensitive' };
        }
        return where;
    }
}
