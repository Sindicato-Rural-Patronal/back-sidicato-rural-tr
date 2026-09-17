import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetSiteSettingsUseCase } from '../get-site-settings.js';
import { UpdateSiteSettingsUseCase, UpdateQuotesSourceUseCase } from '../update-site-settings.js';
import { ListQuoteHistoryUseCase } from '../list-quote-history.js';
import type { SiteSettingsRepository } from '../../ports/external/site-settings-repository.js';
import type { MarketQuoteRepository } from '../../ports/external/market-quote-repository.js';
import { ValidationError } from '../../errors/validation.js';

const settings = { getAll: vi.fn(),
upsertMany: vi.fn() } as unknown as SiteSettingsRepository;

describe('Configurações do site', () => {
    beforeEach(() => vi.clearAllMocks());

    it('devolve todos os campos, vazios quando não gravados', async () => {
        vi.mocked(settings.getAll).mockResolvedValue({ 'org.phone': '(44) 3645-1200',
'quotes.source': 'Cvale' });
        const r = await new GetSiteSettingsUseCase(settings).execute();
        expect(r.orgPhone).toBe('(44) 3645-1200');
        expect(r.quotesSource).toBe('Cvale');
        expect(r.aboutText).toBe('');
        expect(r.facebook).toBe('');
    });

    it('grava só os campos enviados, nas chaves certas, com UF maiúscula', async () => {
        const r = await new UpdateSiteSettingsUseCase(settings).execute({ orgCity: ' Terra Roxa ',
orgState: 'pr',
aboutText: 'Fundado em 1986.' });
        expect(r.error).toBeUndefined();
        expect(settings.upsertMany).toHaveBeenCalledWith({ 'org.city': 'Terra Roxa',
'org.state': 'PR',
'about.text': 'Fundado em 1986.' });
    });

    it.each([
        ['e-mail inválido', { orgEmail: 'nao-e-email' }, 'E-mail'],
        ['UF inválida', { orgState: 'Paraná' }, 'UF'],
        ['link sem https', { instagram: 'instagram.com/x' }, 'Instagram'],
    ])('recusa %s', async (_n, input, trecho) => {
        const r = await new UpdateSiteSettingsUseCase(settings).execute(input);
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(r.error?.message).toContain(trecho);
        expect(settings.upsertMany).not.toHaveBeenCalled();
    });

    it('fonte das cotações não entra pelo endpoint geral, só pelo próprio', async () => {
        await new UpdateSiteSettingsUseCase(settings).execute({ quotesSource: 'Outra' });
        expect(settings.upsertMany).toHaveBeenCalledWith({});
        await new UpdateQuotesSourceUseCase(settings).execute({ source: ' Coamo ' });
        expect(settings.upsertMany).toHaveBeenLastCalledWith({ 'quotes.source': 'Coamo' });
    });
});

describe('Histórico das cotações', () => {
    const quotes = {
        findAll: vi.fn(),
        historySince: vi.fn(),
    } as unknown as MarketQuoteRepository;
    // 17/09/2026 01:30 UTC ainda é 16/09 em Brasília.
    const now = () => new Date('2026-09-17T01:30:00.000Z');

    beforeEach(() => vi.clearAllMocks());

    it('agrupa por produto, pula quem não tem ponto e usa a janela a partir de hoje em Brasília', async () => {
        vi.mocked(quotes.findAll).mockResolvedValue([
            { id: 'soja',
label: 'SOJA',
unit: 'sc 60kg' },
            { id: 'trigo',
label: 'TRIGO',
unit: 'sc 60kg' },
        ] as never);
        vi.mocked(quotes.historySince).mockResolvedValue([
            { marketQuoteId: 'soja',
referenceDate: new Date('2026-09-15T00:00:00.000Z'),
period: 'MORNING',
numeric: 120.5 },
            { marketQuoteId: 'soja',
referenceDate: new Date('2026-09-16T00:00:00.000Z'),
period: 'AFTERNOON',
numeric: 121.1 },
        ] as never);
        const r = await new ListQuoteHistoryUseCase(quotes, now).execute({ days: '7' });
        expect(quotes.historySince).toHaveBeenCalledWith(new Date('2026-09-10T00:00:00.000Z'));
        expect(r.series).toEqual([
            {
                id: 'soja',
                label: 'SOJA',
                unit: 'sc 60kg',
                points: [
                    { date: '2026-09-15',
period: 'MORNING',
priceCents: 12050 },
                    { date: '2026-09-16',
period: 'AFTERNOON',
priceCents: 12110 },
                ],
            },
        ]);
    });

    it('recusa janela fora de 7 a 365 dias', async () => {
        const uc = new ListQuoteHistoryUseCase(quotes, now);
        expect((await uc.execute({ days: 3 })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute({ days: 400 })).error).toBeInstanceOf(ValidationError);
    });
});
