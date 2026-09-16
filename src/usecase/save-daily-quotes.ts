import { z } from 'zod';
import type { MarketQuoteRepository, DailyQuoteEntry } from '../ports/external/market-quote-repository.js';
import { ValidationError } from '../errors/validation.js';
import { MarketQuoteNotFoundError } from '../errors/not-found.js';
import { formatVariation } from '../lib/quote-number.js';
import { formatQuoteValue, todayInBrazil } from '../lib/quote-products.js';

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
        for (const p of prices) {
            const quote = await this.repo.findById(p.id);
            if (!quote) return { error: new MarketQuoteNotFoundError() };
            const previous = await this.repo.getPreviousNumeric(p.id, referenceDate, period);
            entries.push({
                id: p.id,
                priceCents: p.priceCents,
                value: formatQuoteValue(p.priceCents, quote.unit),
                variation: formatVariation(previous, p.priceCents / 100),
                referenceDate,
                period,
            });
        }
        await this.repo.saveDaily(entries);
        return {};
    }
}
