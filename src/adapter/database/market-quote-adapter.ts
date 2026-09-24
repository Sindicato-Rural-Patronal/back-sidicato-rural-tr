import type { PrismaClient } from '@prisma/client/extension';
import type { MarketQuoteModel } from '../../generated/prisma/models/MarketQuote.js';
import type {
    MarketQuoteRepository,
    DailyQuoteEntry,
    DayPriceRow,
    QuoteHistoryRow,
} from '../../ports/external/market-quote-repository.js';
import type { QuotePeriod } from '../../lib/quote-products.js';

export function createMarketQuoteAdapter(prisma: PrismaClient): MarketQuoteRepository {
    return new MarketQuoteAdapter(prisma);
}

class MarketQuoteAdapter implements MarketQuoteRepository {
    constructor(private prisma: PrismaClient) {}

    findAll(publicOnly: boolean): Promise<MarketQuoteModel[]> {
        return this.prisma.marketQuote.findMany({
            where: publicOnly ? { isActive: true,
priceCents: { not: null } } : {},
            orderBy: [{ order: 'asc' },
{ createdAt: 'asc' }],
        });
    }

    findById(id: string): Promise<MarketQuoteModel | null> {
        return this.prisma.marketQuote.findUnique({ where: { id } });
    }

    async getPreviousNumeric(marketQuoteId: string, referenceDate: Date, period: QuotePeriod): Promise<number | null> {
        const row = await this.prisma.marketQuoteHistory.findFirst({
            where: {
                marketQuoteId,
                numeric: { not: null },
                // Só lançamentos ANTERIORES: dias antes, a manhã do mesmo dia (se
                // agora é tarde) e linhas antigas sem data.
                OR: [
                    { referenceDate: null },
                    { referenceDate: { lt: referenceDate } },
                    ...(period === 'AFTERNOON' ? [{ referenceDate,
period: 'MORNING' }] : []),
                ],
            },
            orderBy: [
                { referenceDate: { sort: 'desc',
nulls: 'last' } },
                { period: { sort: 'desc',
nulls: 'last' } },
                { createdAt: 'desc' },
            ],
            select: { numeric: true },
        });
        return row?.numeric ?? null;
    }

    async updateVariation(id: string, variation: string | null): Promise<void> {
        await this.prisma.marketQuote.update({ where: { id },
data: { variation } });
    }

    updateUnit(id: string, unit: string | null, value: string): Promise<MarketQuoteModel> {
        return this.prisma.marketQuote.update({ where: { id },
data: { unit,
value } });
    }

    historySince(since: Date): Promise<QuoteHistoryRow[]> {
        return this.prisma.marketQuoteHistory.findMany({
            where: { referenceDate: { gte: since },
numeric: { not: null } },
            select: { marketQuoteId: true,
referenceDate: true,
period: true,
numeric: true },
            orderBy: [{ referenceDate: 'asc' },
{ period: 'asc' },
{ createdAt: 'asc' }],
        });
    }

    async dayPrices(pairs: { id: string; date: Date }[]): Promise<DayPriceRow[]> {
        if (pairs.length === 0) return [];
        const rows = await this.prisma.marketQuoteHistory.findMany({
            where: {
                numeric: { not: null },
                OR: pairs.map(p => ({ marketQuoteId: p.id,
referenceDate: p.date })),
            },
            select: { marketQuoteId: true,
period: true,
numeric: true },
        });
        // O historico guarda em reais (numeric = priceCents / 100); a tela
        // trabalha em centavos, entao volta multiplicado.
        type Linha = { marketQuoteId: string; period: QuotePeriod | null; numeric: number | null };
        return (rows as Linha[]).map(r => ({
            marketQuoteId: r.marketQuoteId,
            period: r.period,
            priceCents: Math.round((r.numeric ?? 0) * 100),
        }));
    }

    async saveDaily(entries: DailyQuoteEntry[]): Promise<void> {
        await this.prisma.$transaction(
            entries.flatMap(e => [
                ...(e.updateCurrent ? [this.prisma.marketQuote.update({
                    where: { id: e.id },
                    data: {
                        priceCents: e.priceCents,
                        value: e.value,
                        variation: e.variation,
                        referenceDate: e.referenceDate,
                        period: e.period,
                    },
                })] : []),
                this.prisma.marketQuoteHistory.deleteMany({
                    where: { marketQuoteId: e.id,
referenceDate: e.referenceDate,
period: e.period },
                }),
                this.prisma.marketQuoteHistory.create({
                    data: {
                        marketQuoteId: e.id,
                        value: e.value,
                        numeric: e.priceCents / 100,
                        referenceDate: e.referenceDate,
                        period: e.period,
                    },
                }),
            ]),
        );
    }
}
