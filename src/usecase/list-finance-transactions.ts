import { z } from 'zod';
import type {
    FinanceRepository,
    FinanceTransactionWithCategory,
} from '../ports/external/finance-repository.js';

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(20),
    from: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
    to: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
    type: z.enum(['IN', 'OUT']).optional(),
    categoryId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    accountId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    search: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
});

export type FinanceTransactionsPage = {
    data: FinanceTransactionWithCategory[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

export class ListFinanceTransactionsUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(query: unknown): Promise<FinanceTransactionsPage> {
        const q = querySchema.parse(query ?? {});
        // `to` costuma vir como data (00:00) — inclui o dia inteiro.
        const to = q.to ? new Date(q.to.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

        const { items, total } = await this.repo.listTransactions({
            from: q.from,
            to,
            type: q.type,
            categoryId: q.categoryId,
            accountId: q.accountId,
            search: q.search,
            skip: (q.page - 1) * q.limit,
            take: q.limit,
        });

        return {
            data: items,
            total,
            page: q.page,
            limit: q.limit,
            totalPages: Math.max(1, Math.ceil(total / q.limit)),
        };
    }
}
