import type { PrismaClient } from '@prisma/client/extension';
import type { MarketQuoteModel } from '../../generated/prisma/models/MarketQuote.js';
import type {
    MarketQuoteRepository,
    MarketQuoteCreateInput,
    MarketQuoteUpdateInput,
} from '../../ports/external/market-quote-repository.js';

export function createMarketQuoteAdapter(prisma: PrismaClient): MarketQuoteRepository {
    return new MarketQuoteAdapter(prisma);
}

class MarketQuoteAdapter implements MarketQuoteRepository {
    constructor(private prisma: PrismaClient) {}

    findAll(activeOnly: boolean): Promise<MarketQuoteModel[]> {
        return this.prisma.marketQuote.findMany({
            where: activeOnly ? { isActive: true } : {},
            orderBy: [{ order: 'asc' },
{ createdAt: 'asc' }],
        });
    }

    findById(id: string): Promise<MarketQuoteModel | null> {
        return this.prisma.marketQuote.findUnique({ where: { id } });
    }

    create(data: MarketQuoteCreateInput): Promise<MarketQuoteModel> {
        return this.prisma.marketQuote.create({ data });
    }

    update(id: string, data: MarketQuoteUpdateInput): Promise<MarketQuoteModel> {
        return this.prisma.marketQuote.update({ where: { id },
data });
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.prisma.marketQuote.delete({ where: { id } });
            return true;
        } catch {
            return false;
        }
    }
}
