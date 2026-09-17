import type { MarketQuoteModel } from '../../generated/prisma/models/MarketQuote.js';
import type { QuotePeriod } from '../../lib/quote-products.js';

export type { MarketQuoteModel };

/** Lançamento de um produto num dia/período. */
export type DailyQuoteEntry = {
    id: string;
    priceCents: number;
    value: string;
    variation: string | null;
    referenceDate: Date;
    period: QuotePeriod;
};

export interface MarketQuoteRepository {
    /** Produtos na ordem da home. `publicOnly` = só ativos e com preço lançado. */
    findAll(publicOnly: boolean): Promise<MarketQuoteModel[]>;
    findById(id: string): Promise<MarketQuoteModel | null>;
    /**
     * Último preço (em reais) lançado ANTES do dia/período informado — base da
     * variação. Relançar o mesmo dia/período não compara o preço com ele mesmo.
     */
    getPreviousNumeric(marketQuoteId: string, referenceDate: Date, period: QuotePeriod): Promise<number | null>;
    /** Troca a unidade do produto e o texto pronto do preço atual. */
    updateUnit(id: string, unit: string | null, value: string): Promise<MarketQuoteModel>;
    /** Grava preço no produto e no histórico (substitui o mesmo dia/período), numa transação. */
    saveDaily(entries: DailyQuoteEntry[]): Promise<void>;
    /** Lançamentos com data a partir de `since`, em ordem cronológica (dia, depois manhã/tarde). */
    historySince(since: Date): Promise<QuoteHistoryRow[]>;
}

export type QuoteHistoryRow = {
    marketQuoteId: string;
    referenceDate: Date;
    period: QuotePeriod | null;
    numeric: number;
};
