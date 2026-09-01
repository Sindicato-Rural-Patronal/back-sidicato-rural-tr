import type {
    MarketQuoteRepository,
    MarketQuoteModel,
} from '../ports/external/market-quote-repository.js';

export class ListMarketQuotesUseCase {
    constructor(private readonly repo: MarketQuoteRepository) {}

    execute(activeOnly: boolean): Promise<MarketQuoteModel[]> {
        return this.repo.findAll(activeOnly);
    }
}
