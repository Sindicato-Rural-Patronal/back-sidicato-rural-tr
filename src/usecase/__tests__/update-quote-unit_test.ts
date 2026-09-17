import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateQuoteUnitUseCase } from '../update-quote-unit.js';
import type { MarketQuoteRepository } from '../../ports/external/market-quote-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { MarketQuoteNotFoundError } from '../../errors/not-found.js';

const repo = {
    findById: vi.fn(),
    updateUnit: vi.fn(),
} as unknown as MarketQuoteRepository;

describe('UpdateQuoteUnitUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.updateUnit).mockImplementation(async (id, unit, value) => ({ id,
unit,
value }) as never);
    });

    it('troca a unidade e refaz o texto do preço atual', async () => {
        vi.mocked(repo.findById).mockResolvedValue({ id: 'mandioca',
priceCents: 76000,
unit: 't',
value: 'R$ 760,00 /t' } as never);
        const r = await new UpdateQuoteUnitUseCase(repo).execute('mandioca', { unit: 'kg' });
        expect(r.error).toBeUndefined();
        expect(repo.updateUnit).toHaveBeenCalledWith('mandioca', 'kg', 'R$ 760,00 /kg');
    });

    it('aceita sem unidade e mantém o texto de produto sem preço', async () => {
        vi.mocked(repo.findById).mockResolvedValue({ id: 'trigo',
priceCents: null,
unit: 'sc 60kg',
value: '' } as never);
        await new UpdateQuoteUnitUseCase(repo).execute('trigo', { unit: null });
        expect(repo.updateUnit).toHaveBeenCalledWith('trigo', null, '');
    });

    it('recusa unidade fora da lista e produto inexistente', async () => {
        const uc = new UpdateQuoteUnitUseCase(repo);
        expect((await uc.execute('x', { unit: 'litro' })).error).toBeInstanceOf(ValidationError);
        vi.mocked(repo.findById).mockResolvedValue(null);
        expect((await uc.execute('x', { unit: 't' })).error).toBeInstanceOf(MarketQuoteNotFoundError);
    });
});
