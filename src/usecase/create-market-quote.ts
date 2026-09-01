import { z } from 'zod';
import type {
    MarketQuoteRepository,
    MarketQuoteModel,
} from '../ports/external/market-quote-repository.js';
import { ValidationError } from '../errors/validation.js';
import { parseQuoteNumber } from '../lib/quote-number.js';

// `variation` NÃO entra por aqui — é calculada automaticamente pelo histórico.
export const marketQuoteSchema = z.object({
    label: z.string().min(1, 'Informe o rótulo'),
    value: z.string().min(1, 'Informe o valor'),
    referenceDate: z.preprocess(
        v => (v === '' || v == null ? null : v),
        z.coerce.date().nullable(),
    ),
    isActive: z.boolean().optional(),
    order: z.number().int().optional(),
});

export class CreateMarketQuoteUseCase {
    constructor(private readonly repo: MarketQuoteRepository) {}

    async execute(input: unknown): Promise<{ error?: Error; quote?: MarketQuoteModel }> {
        const parsed = marketQuoteSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        // Primeiro cadastro: sem valor anterior → sem variação ainda.
        const quote = await this.repo.create({ ...parsed.data,
variation: null });
        await this.repo.addHistory(quote.id, parsed.data.value, parseQuoteNumber(parsed.data.value));
        return { quote };
    }
}
