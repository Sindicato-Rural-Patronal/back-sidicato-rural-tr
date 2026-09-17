import { z } from 'zod';
import type { MarketQuoteRepository } from '../ports/external/market-quote-repository.js';
import type { QuotePeriod } from '../lib/quote-products.js';
import { ValidationError } from '../errors/validation.js';
import { todayInBrazil } from '../lib/quote-products.js';

export type QuoteHistoryPoint = {
 date: string;
period: QuotePeriod | null;
priceCents: number 
};

export type QuoteHistorySeries = {
    id: string;
    label: string;
    unit: string | null;
    points: QuoteHistoryPoint[];
};

const querySchema = z.object({
    days: z.coerce.number().int().min(7, 'Mínimo de 7 dias').max(365, 'Máximo de 365 dias').default(90),
});

// Histórico público das cotações: um ponto por lançamento (dia + período) dos
// produtos ativos, dentro da janela pedida (padrão 90 dias).
export class ListQuoteHistoryUseCase {
    constructor(
        private readonly repo: MarketQuoteRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(query: unknown): Promise<{
 error?: Error;
series?: QuoteHistorySeries[] 
}> {
        const parsed = querySchema.safeParse(query ?? {});
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const since = todayInBrazil(this.now());
        since.setUTCDate(since.getUTCDate() - (parsed.data.days - 1));

        const [products, rows] = await Promise.all([this.repo.findAll(true), this.repo.historySince(since)]);
        const byProduct = new Map<string, QuoteHistoryPoint[]>();
        for (const r of rows) {
            const list = byProduct.get(r.marketQuoteId) ?? [];
            list.push({
                date: r.referenceDate.toISOString().slice(0, 10),
                period: r.period,
                priceCents: Math.round(r.numeric * 100),
            });
            byProduct.set(r.marketQuoteId, list);
        }

        const series = products
            .map(p => ({ id: p.id,
label: p.label,
unit: p.unit,
points: byProduct.get(p.id) ?? [] }))
            .filter(s => s.points.length > 0);
        return { series };
    }
}
