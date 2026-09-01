import type { MarketQuoteRepository } from '../ports/external/market-quote-repository.js';
import { MarketQuoteNotFoundError } from '../errors/not-found.js';

export class DeleteMarketQuoteUseCase {
    constructor(private readonly repo: MarketQuoteRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new MarketQuoteNotFoundError() };
        await this.repo.delete(id);
        return {};
    }
}
