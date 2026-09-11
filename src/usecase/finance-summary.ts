import { z } from 'zod';
import type { FinanceRepository, FinanceSummary } from '../ports/external/finance-repository.js';

const querySchema = z.object({
    from: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
    to: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
});

export class FinanceSummaryUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(query: unknown): Promise<FinanceSummary> {
        const q = querySchema.parse(query ?? {});
        const now = new Date();
        // Padrão: últimos 12 meses (para o gráfico mensal ter contexto).
        const from = q.from ?? new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const rawTo = q.to ?? now;
        // Inclui o dia inteiro do `to`.
        const to = new Date(rawTo.getFullYear(), rawTo.getMonth(), rawTo.getDate(), 23, 59, 59, 999);
        return this.repo.summary(from, to);
    }
}
