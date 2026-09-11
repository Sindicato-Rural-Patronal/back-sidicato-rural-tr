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
        // Padrão: últimos 12 meses. UTC + aritmética por getTime() — consistente
        // com list/export, sem depender do fuso do servidor.
        const from = q.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
        // Inclui o dia inteiro do `to` (mesma conta de list/export). Sem `to` → agora.
        const to = q.to ? new Date(q.to.getTime() + 24 * 60 * 60 * 1000 - 1) : now;
        return this.repo.summary(from, to);
    }
}
