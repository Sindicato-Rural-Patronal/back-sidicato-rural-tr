import { z } from 'zod';
import type {
    MarketQuoteRepository,
    MarketQuoteModel,
} from '../ports/external/market-quote-repository.js';
import { ValidationError } from '../errors/validation.js';

export const marketQuoteSchema = z.object({
    label: z.string().min(1, 'Informe o rótulo'),
    value: z.string().min(1, 'Informe o valor'),
    variation: z.string().trim().nullish(),
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
        const quote = await this.repo.create(parsed.data);
        return { quote };
    }
}
