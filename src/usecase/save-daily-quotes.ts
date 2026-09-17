import { z } from 'zod';
import type { MarketQuoteRepository, DailyQuoteEntry } from '../ports/external/market-quote-repository.js';
import { ValidationError } from '../errors/validation.js';
import { MarketQuoteNotFoundError } from '../errors/not-found.js';
import { formatVariation } from '../lib/quote-number.js';
import { formatQuoteValue, todayInBrazil, type QuotePeriod } from '../lib/quote-products.js';

export const dailyQuotesSchema = z.object({
    period: z.enum(['MORNING', 'AFTERNOON'], { message: 'Escolha o período: manhã ou tarde' }),
    prices: z
        .array(z.object({
            id: z.string().trim().min(1).max(64),
            priceCents: z
                .number()
                .int('Preço inválido')
                .min(1, 'Preço deve ser maior que zero')
                .max(100_000_000, 'Preço muito alto'),
        }))
        .min(1, 'Informe o preço de pelo menos um produto'),
});

/** Ordem cronológica de um lançamento: dia, depois manhã antes da tarde. */
function launchOrder(date: Date, period: QuotePeriod): number {
    return date.getTime() * 2 + (period === 'AFTERNOON' ? 1 : 0);
}

// Lançamento das cotações: produtos fixos, só preço + período (manhã/tarde).
// A data é sempre a de hoje no horário de Brasília — não vem do painel.
export class SaveDailyQuotesUseCase {
    constructor(
        private readonly repo: MarketQuoteRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(input: unknown): Promise<{ error?: Error }> {
        const parsed = dailyQuotesSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const { period, prices } = parsed.data;
        if (new Set(prices.map(p => p.id)).size !== prices.length) {
            return { error: new ValidationError('Produto repetido no lançamento') };
        }

        const referenceDate = todayInBrazil(this.now());
        const entries: DailyQuoteEntry[] = [];
        // Preço atual que continua valendo (ex.: corrigiu a manhã depois de lançar a tarde).
        const keptCurrent: {
 id: string;
priceCents: number;
referenceDate: Date;
period: QuotePeriod 
}[] = [];
        for (const p of prices) {
            const quote = await this.repo.findById(p.id);
            if (!quote) return { error: new MarketQuoteNotFoundError() };
            const previous = await this.repo.getPreviousNumeric(p.id, referenceDate, period);
            const current = quote.referenceDate && quote.period && quote.priceCents != null
                ? { referenceDate: quote.referenceDate,
period: quote.period as QuotePeriod,
priceCents: quote.priceCents }
                : null;
            const updateCurrent = !current || launchOrder(referenceDate, period) >= launchOrder(current.referenceDate, current.period);
            if (current && !updateCurrent) keptCurrent.push({ id: p.id,
...current });
            entries.push({
                id: p.id,
                priceCents: p.priceCents,
                value: formatQuoteValue(p.priceCents, quote.unit),
                variation: formatVariation(previous, p.priceCents / 100),
                referenceDate,
                period,
                updateCurrent,
            });
        }
        await this.repo.saveDaily(entries);
        // A correção muda a base da variação do preço atual.
        for (const c of keptCurrent) {
            const previous = await this.repo.getPreviousNumeric(c.id, c.referenceDate, c.period);
            await this.repo.updateVariation(c.id, formatVariation(previous, c.priceCents / 100));
        }
        return {};
    }
}
