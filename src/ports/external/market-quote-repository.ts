import type { MarketQuoteModel } from '../../generated/prisma/models/MarketQuote.js';

export type { MarketQuoteModel };

export type MarketQuoteCreateInput = {
    label: string;
    value: string;
    variation?: string | null;
    referenceDate?: Date | null;
    isActive?: boolean;
    order?: number;
};

export type MarketQuoteUpdateInput = Partial<MarketQuoteCreateInput>;

export interface MarketQuoteRepository {
    findAll(activeOnly: boolean): Promise<MarketQuoteModel[]>;
    findById(id: string): Promise<MarketQuoteModel | null>;
    create(data: MarketQuoteCreateInput): Promise<MarketQuoteModel>;
    update(id: string, data: MarketQuoteUpdateInput): Promise<MarketQuoteModel>;
    delete(id: string): Promise<boolean>;
    // Histórico de valores → cálculo automático da variação.
    addHistory(marketQuoteId: string, value: string, numeric: number | null): Promise<void>;
    getLastNumeric(marketQuoteId: string): Promise<number | null>;
}
