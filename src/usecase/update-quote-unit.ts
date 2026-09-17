import { z } from 'zod';
import type { MarketQuoteModel, MarketQuoteRepository } from '../ports/external/market-quote-repository.js';
import { ValidationError } from '../errors/validation.js';
import { MarketQuoteNotFoundError } from '../errors/not-found.js';
import { formatQuoteValue, QUOTE_UNITS } from '../lib/quote-products.js';

const schema = z.object({
    unit: z.enum(QUOTE_UNITS, { message: 'Unidade inválida' }).nullable(),
});

// Unidade do produto (saca, tonelada, quilo…). Vale para o preço atual e para o
// histórico exibido no site; os preços gravados não mudam.
export class UpdateQuoteUnitUseCase {
    constructor(private readonly repo: MarketQuoteRepository) {}

    async execute(id: string, input: unknown): Promise<{
 error?: Error;
quote?: MarketQuoteModel 
}> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const quote = await this.repo.findById(id);
        if (!quote) return { error: new MarketQuoteNotFoundError() };

        const { unit } = parsed.data;
        const value = quote.priceCents != null ? formatQuoteValue(quote.priceCents, unit) : quote.value;
        return { quote: await this.repo.updateUnit(id, unit, value) };
    }
}
