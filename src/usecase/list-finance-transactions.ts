import { z } from 'zod';
import type {
    FinanceRepository,
    FinanceTransactionSum,
    FinanceTransactionWithCategory,
} from '../ports/external/finance-repository.js';
import { parseQuery } from '../errors/validation.js';
import { endOfDay, financeFiltersSchema } from './finance-filters.js';
import { NO_EXTRA_PERMISSIONS, type ExportActor } from './export/engine.js';
import { financeTransactionsSource } from './export/catalog/finance-transactions.js';
import { catalogColumns, celulasDoCatalogo, lerColunasDoCatalogo, type CatalogColumn } from './export/visoes.js';

export { endOfDay, financeFiltersSchema } from './finance-filters.js';

const querySchema = financeFiltersSchema.extend({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(20),
});

export type FinanceTransactionsTotals = {
    incomeCents: number;
    expenseCents: number;
};

/** Um lançamento da lista; com `fields`, também as células das colunas pedidas. */
export type FinanceTransactionListItem = FinanceTransactionWithCategory & {
    /** Com `fields`: o texto de cada coluna, na ordem de `columns` ("" = vazio). */
    cells?: string[];
};

export type FinanceTransactionsPage = {
    data: FinanceTransactionListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Entradas e saídas de todos os lançamentos filtrados (não só da página). */
    totals: FinanceTransactionsTotals;
    /** Só com `fields` (decisão 007): as colunas pedidas, na ordem. */
    columns?: CatalogColumn[];
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
    constructor(
        private readonly repo: FinanceRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * A página de lançamentos. Com `fields` (decisão 007: as colunas da visão
     * da tela), a resposta ganha `columns` e cada linha ganha `cells`, com o
     * catálogo e a função de célula da exportação. Sem `fields`, igual a antes.
     * Erro de `fields` é lançado: `ValidationError` (400) ou `ForbiddenError`.
     */
    async execute(query: unknown, actor: ExportActor = NO_EXTRA_PERMISSIONS): Promise<FinanceTransactionsPage> {
        const q = parseQuery(querySchema, query);
        const rawFields = (query as Record<string, unknown> | null | undefined)?.fields;
        const fields = rawFields === undefined
            ? undefined
            : lerColunasDoCatalogo<FinanceTransactionWithCategory>(financeTransactionsSource, rawFields, actor);
        if (fields instanceof Error) throw fields;
        const filters = {
            from: q.from,
            to: endOfDay(q.to),
            type: q.type,
            categoryId: q.categoryId,
            accountId: q.accountId,
            method: q.method,
            search: q.search,
            orderBy: q.orderBy,
            excludeTransfers: q.excludeTransfers,
        };

        const [{ items, total }, sums] = await Promise.all([
            this.repo.listTransactions({
                ...filters,
                skip: (q.page - 1) * q.limit,
                take: q.limit,
            }),
            this.repo.sumTransactions(filters),
        ]);

        const page: FinanceTransactionsPage = {
            data: items,
            total,
            page: q.page,
            limit: q.limit,
            totalPages: Math.max(1, Math.ceil(total / q.limit)),
            totals: financeTotals(sums),
        };
        if (!fields) return page;

        const cells = celulasDoCatalogo(fields, items, { offset: (q.page - 1) * q.limit,
now: this.now() });
        return {
            ...page,
            columns: catalogColumns(fields),
            data: items.map((item, i) => ({ ...item,
cells: cells[i] })),
        };
    }
}
