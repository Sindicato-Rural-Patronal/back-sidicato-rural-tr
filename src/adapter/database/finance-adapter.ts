import type { PrismaClient } from '@prisma/client/extension';
import type { FinancialCategoryModel } from '../../generated/prisma/models/FinancialCategory.js';
import type { FinancialTransactionModel } from '../../generated/prisma/models/FinancialTransaction.js';
import type {
    FinanceRepository,
    FinanceCategoryCreateInput,
    FinanceCategoryUpdateInput,
    FinanceTransactionCreateInput,
    FinanceTransactionUpdateInput,
    FinanceTransactionFilters,
    FinanceTransactionWithCategory,
    FinanceSummary,
} from '../../ports/external/finance-repository.js';

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

    // ── Lançamentos ─────────────────────────────────────────────────────────
    async listTransactions(
        filters: FinanceTransactionFilters,
    ): Promise<{ items: FinanceTransactionWithCategory[]; total: number }> {
        const where = this.buildWhere(filters);
        const [items, total] = await Promise.all([
            this.prisma.financialTransaction.findMany({
                where,
                include: { category: true },
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
                skip: filters.skip,
                take: filters.take,
            }),
            this.prisma.financialTransaction.count({ where }),
        ]);
        return { items, total };
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
        };
    }

    private buildWhere(filters: FinanceTransactionFilters) {
        const where: Record<string, unknown> = { isDeleted: false };
        if (filters.type) where.type = filters.type;
        if (filters.categoryId) where.categoryId = filters.categoryId;
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
