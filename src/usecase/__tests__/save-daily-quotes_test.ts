import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveDailyQuotesUseCase } from '../save-daily-quotes.js';
import type { MarketQuoteRepository } from '../../ports/external/market-quote-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { MarketQuoteNotFoundError } from '../../errors/not-found.js';
import { formatQuoteValue, todayInBrazil } from '../../lib/quote-products.js';

const repo = {
    findAll: vi.fn(),
    findById: vi.fn(),
    getPreviousNumeric: vi.fn(),
    saveDaily: vi.fn(),
} as unknown as MarketQuoteRepository;

// 17/09/2026 01:30 UTC ainda é 16/09 em Brasília.
const now = () => new Date('2026-09-17T01:30:00.000Z');

describe('formatQuoteValue / todayInBrazil', () => {
    it('formata com milhar, centavos e unidade', () => {
        expect(formatQuoteValue(123450, 'sc 60kg')).toBe('R$ 1.234,50 /sc 60kg');
        expect(formatQuoteValue(523, null)).toBe('R$ 5,23');
        expect(formatQuoteValue(7, 't')).toBe('R$ 0,07 /t');
    });

    it('usa o dia de Brasília, não o UTC', () => {
        expect(todayInBrazil(now()).toISOString()).toBe('2026-09-16T00:00:00.000Z');
    });
});

describe('SaveDailyQuotesUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.findById).mockImplementation(async id =>
            ({ id,
unit: id === 'dolar' ? null : 'sc 60kg' }) as never);
        vi.mocked(repo.getPreviousNumeric).mockResolvedValue(null);
    });

    it('grava preço, período, data de hoje e texto formatado', async () => {
        vi.mocked(repo.getPreviousNumeric).mockImplementation(async id => (id === 'soja' ? 100 : null));
        const r = await new SaveDailyQuotesUseCase(repo, now).execute({
            period: 'AFTERNOON',
            prices: [{ id: 'soja',
priceCents: 12050 },
{ id: 'dolar',
priceCents: 523 }],
        });
        expect(r.error).toBeUndefined();
        const date = new Date('2026-09-16T00:00:00.000Z');
        expect(repo.getPreviousNumeric).toHaveBeenCalledWith('soja', date, 'AFTERNOON');
        expect(repo.saveDaily).toHaveBeenCalledWith([
            { id: 'soja',
priceCents: 12050,
value: 'R$ 120,50 /sc 60kg',
variation: '+20,5%',
referenceDate: date,
period: 'AFTERNOON' },
            { id: 'dolar',
priceCents: 523,
value: 'R$ 5,23',
variation: null,
referenceDate: date,
period: 'AFTERNOON' },
        ]);
    });

    it.each([
        ['sem período', { prices: [{ id: 'soja',
priceCents: 100 }] }, 'período'],
        ['período inválido', { period: 'NOITE',
prices: [{ id: 'soja',
priceCents: 100 }] }, 'período'],
        ['lista vazia', { period: 'MORNING',
prices: [] }, 'pelo menos um produto'],
        ['preço zero', { period: 'MORNING',
prices: [{ id: 'soja',
priceCents: 0 }] }, 'maior que zero'],
        ['preço quebrado', { period: 'MORNING',
prices: [{ id: 'soja',
priceCents: 10.5 }] }, 'Preço inválido'],
        ['produto repetido', { period: 'MORNING',
prices: [{ id: 'soja',
priceCents: 1 },
{ id: 'soja',
priceCents: 2 }] }, 'repetido'],
    ])('rejeita %s sem gravar nada', async (_n, input, trecho) => {
        const r = await new SaveDailyQuotesUseCase(repo, now).execute(input);
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(r.error?.message).toContain(trecho);
        expect(repo.saveDaily).not.toHaveBeenCalled();
    });

    it('produto inexistente é 404 e nada é gravado', async () => {
        vi.mocked(repo.findById).mockImplementation(async id => (id === 'soja' ? ({ id,
unit: 'sc 60kg' } as never) : null));
        const r = await new SaveDailyQuotesUseCase(repo, now).execute({
            period: 'MORNING',
            prices: [{ id: 'soja',
priceCents: 100 },
{ id: 'cafe',
priceCents: 100 }],
        });
        expect(r.error).toBeInstanceOf(MarketQuoteNotFoundError);
        expect(repo.saveDaily).not.toHaveBeenCalled();
    });
});
