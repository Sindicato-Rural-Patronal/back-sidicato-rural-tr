import type {
    MarketQuoteRepository,
    MarketQuoteModel,
} from '../ports/external/market-quote-repository.js';

/**
 * O produto guarda só o ÚLTIMO preço lançado. A home mostra manhã e tarde lado
 * a lado, como a página antiga, então os dois preços do dia de referência vêm
 * do histórico. Produto sem lançamento naquele período fica com null — é a
 * diferença entre "não foi lançado" e "custou zero".
 */
export type MarketQuoteWithDay = MarketQuoteModel & {
    morningCents: number | null;
    afternoonCents: number | null;
};

export class ListMarketQuotesUseCase {
    constructor(private readonly repo: MarketQuoteRepository) {}

    async execute(publicOnly: boolean): Promise<MarketQuoteWithDay[]> {
        const quotes = await this.repo.findAll(publicOnly);
        const pairs = quotes
            .filter(q => q.referenceDate != null)
            .map(q => ({ id: q.id,
date: q.referenceDate as Date }));
        const prices = await this.repo.dayPrices(pairs);

        return quotes.map(q => {
            const doDia = prices.filter(p => p.marketQuoteId === q.id);
            return {
                ...q,
                morningCents: doDia.find(p => p.period === 'MORNING')?.priceCents ?? null,
                afternoonCents: doDia.find(p => p.period === 'AFTERNOON')?.priceCents ?? null,
            };
        });
    }
}
