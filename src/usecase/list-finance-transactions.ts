import { z } from 'zod';
import type {
    FinanceRepository,
    FinanceTransactionSum,
    FinanceTransactionWithCategory,
} from '../ports/external/finance-repository.js';

/** Filtros dos lançamentos (lista e exportação usam os mesmos). */
export const financeFiltersSchema = z.object({
    from: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
    to: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
    type: z.enum(['IN', 'OUT']).optional(),
    categoryId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    accountId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    // Forma de pagamento (texto do lançamento) — o filtro ignora maiúsculas.
    method: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
    search: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
});

/** `to` costuma vir como data (00:00 UTC) — inclui o dia inteiro. */
export function endOfDay(d: Date | undefined): Date | undefined {
    return d ? new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
}

const querySchema = financeFiltersSchema.extend({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(20),
});

export type FinanceTransactionsTotals = {
    incomeCents: number;
    expenseCents: number;
};

export type FinanceTransactionsPage = {
    data: FinanceTransactionWithCategory[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Entradas e saídas de todos os lançamentos filtrados (não só da página). */
    totals: FinanceTransactionsTotals;
};

/**
 * Mesma regra do dashboard: transferência entre caixas não é receita nem
 * despesa, e "só nota" (sem tipo) não entra no caixa — nenhum dos dois conta.
 */
export function financeTotals(sums: FinanceTransactionSum[]): FinanceTransactionsTotals {
    let incomeCents = 0;
    let expenseCents = 0;
    for (const s of sums) {
        if (s.transfer) continue;
        if (s.type === 'IN') incomeCents += s.amountCents;
        else if (s.type === 'OUT') expenseCents += s.amountCents;
    }
    return { incomeCents,
expenseCents };
}

export class ListFinanceTransactionsUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(query: unknown): Promise<FinanceTransactionsPage> {
        const q = querySchema.parse(query ?? {});
        const filters = {
            from: q.from,
            to: endOfDay(q.to),
            type: q.type,
            categoryId: q.categoryId,
            accountId: q.accountId,
            method: q.method,
            search: q.search,
        };

        const [{ items, total }, sums] = await Promise.all([
            this.repo.listTransactions({
                ...filters,
                skip: (q.page - 1) * q.limit,
                take: q.limit,
            }),
            this.repo.sumTransactions(filters),
        ]);

        return {
            data: items,
            total,
            page: q.page,
            limit: q.limit,
            totalPages: Math.max(1, Math.ceil(total / q.limit)),
            totals: financeTotals(sums),
        };
    }
}
