import type { MarketQuoteRepository } from '../ports/external/market-quote-repository.js';
import { ValidationError } from '../errors/validation.js';
import { MarketQuoteNotFoundError } from '../errors/not-found.js';
import { marketQuoteSchema } from './create-market-quote.js';

const updateSchema = marketQuoteSchema.partial();

export class UpdateMarketQuoteUseCase {
    constructor(private readonly repo: MarketQuoteRepository) {}

    async execute(id: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new MarketQuoteNotFoundError() };
        await this.repo.update(id, parsed.data);
        return {};
    }
}
