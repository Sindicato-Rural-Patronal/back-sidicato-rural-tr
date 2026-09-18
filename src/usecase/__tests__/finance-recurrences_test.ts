import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    addMonths,
    dateForMonth,
    lastDayOfMonth,
    monthOf,
    monthsToGenerate,
    MAX_MONTHS_PER_RUN,
    CreateFinanceRecurrenceUseCase,
    DeleteFinanceRecurrenceUseCase,
    GenerateFinanceRecurrencesUseCase,
} from '../finance-recurrences.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const repo = {
    findCategoryById: vi.fn(),
    findAccountById: vi.fn(),
    createRecurrence: vi.fn(),
    softDeleteRecurrence: vi.fn(),
    listRecurrencesToGenerate: vi.fn(),
    createRecurrenceTransaction: vi.fn(),
    setRecurrenceLastGeneratedMonth: vi.fn(),
} as unknown as FinanceRepository;

const rec = (over: Record<string, unknown> = {}) => ({
    id: 'rec-1',
    type: 'OUT' as const,
    description: 'ALUGUEL DA SEDE',
    amountCents: 250000,
    dayOfMonth: 10,
    startMonth: '2026-01',
    endMonth: null,
    lastGeneratedMonth: null,
    paymentMethod: 'PIX',
    notes: null,
    categoryId: null,
    accountId: null,
    ...over,
});

describe('meses "YYYY-MM"', () => {
    it('soma meses virando o ano', () => {
        expect(addMonths('2026-01', 1)).toBe('2026-02');
        expect(addMonths('2026-12', 1)).toBe('2027-01');
        expect(addMonths('2026-03', -4)).toBe('2025-11');
    });

    it('sabe o último dia do mês (inclusive bissexto)', () => {
        expect(lastDayOfMonth('2026-02')).toBe(28);
        expect(lastDayOfMonth('2028-02')).toBe(29);
        expect(lastDayOfMonth('2026-04')).toBe(30);
        expect(lastDayOfMonth('2026-01')).toBe(31);
    });

    it('mês curto usa o último dia dele', () => {
        expect(dateForMonth('2026-02', 31).toISOString().slice(0, 10)).toBe('2026-02-28');
        expect(dateForMonth('2028-02', 30).toISOString().slice(0, 10)).toBe('2028-02-29');
        expect(dateForMonth('2026-04', 31).toISOString().slice(0, 10)).toBe('2026-04-30');
        expect(dateForMonth('2026-03', 10).toISOString().slice(0, 10)).toBe('2026-03-10');
    });

    it('monthOf usa o mês local da data', () => {
        expect(monthOf(new Date(2026, 8, 18))).toBe('2026-09');
    });
});

describe('monthsToGenerate', () => {
    it('gera do início até o mês atual quando nunca gerou', () => {
        expect(monthsToGenerate(rec(), '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
    });

    it('retoma do mês seguinte ao último gerado', () => {
        expect(monthsToGenerate(rec({ lastGeneratedMonth: '2026-02' }), '2026-04'))
            .toEqual(['2026-03', '2026-04']);
    });

    it('não gera nada quando o mês atual já foi gerado (idempotente)', () => {
        expect(monthsToGenerate(rec({ lastGeneratedMonth: '2026-09' }), '2026-09')).toEqual([]);
    });

    it('para no mês final', () => {
        expect(monthsToGenerate(rec({ endMonth: '2026-02' }), '2026-06'))
            .toEqual(['2026-01', '2026-02']);
        expect(monthsToGenerate(rec({ endMonth: '2026-02',
lastGeneratedMonth: '2026-02' }), '2026-06')).toEqual([]);
    });

    it('não gera nada antes do mês inicial', () => {
        expect(monthsToGenerate(rec({ startMonth: '2027-01' }), '2026-09')).toEqual([]);
    });

    it('ignora lastGeneratedMonth anterior ao início', () => {
        expect(monthsToGenerate(rec({ startMonth: '2026-05',
lastGeneratedMonth: '2026-01' }), '2026-06'))
            .toEqual(['2026-05', '2026-06']);
    });

    it('limita a quantidade por rodada', () => {
        expect(monthsToGenerate(rec({ startMonth: '1990-01' }), '2026-09'))
            .toHaveLength(MAX_MONTHS_PER_RUN);
    });
});

describe('CreateFinanceRecurrenceUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('recusa dia fora de 1–31', async () => {
        const uc = new CreateFinanceRecurrenceUseCase(repo);
        expect((await uc.execute({ ...rec(),
dayOfMonth: 0 })).error).toBeDefined();
        expect((await uc.execute({ ...rec(),
dayOfMonth: 32 })).error).toBeDefined();
        expect(repo.createRecurrence).not.toHaveBeenCalled();
    });

    it('recusa mês fora do formato AAAA-MM', async () => {
        const uc = new CreateFinanceRecurrenceUseCase(repo);
        const r = await uc.execute({ ...rec(),
startMonth: '01/2026' });
        expect(r.error?.message).toContain('Mês inválido');
    });

    it('recusa mês final antes do inicial', async () => {
        const uc = new CreateFinanceRecurrenceUseCase(repo);
        const r = await uc.execute({ ...rec(),
startMonth: '2026-05',
endMonth: '2026-02' });
        expect(r.error?.message).toContain('mês final');
    });

    it('recusa categoria de tipo diferente', async () => {
        vi.mocked(repo.findCategoryById).mockResolvedValue({ id: 'c1',
type: 'IN' } as never);
        const uc = new CreateFinanceRecurrenceUseCase(repo);
        const r = await uc.execute({ ...rec(),
categoryId: '11111111-1111-4111-8111-111111111111' });
        expect(r.error?.message).toContain('não corresponde');
    });

    it('cria recorrência válida', async () => {
        vi.mocked(repo.createRecurrence).mockResolvedValue({ id: 'rec-1' } as never);
        const uc = new CreateFinanceRecurrenceUseCase(repo);
        const r = await uc.execute(rec());
        expect(r.error).toBeUndefined();
        expect(vi.mocked(repo.createRecurrence).mock.calls[0][0].amountCents).toBe(250000);
    });
});

describe('GenerateFinanceRecurrencesUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.createRecurrenceTransaction).mockResolvedValue(true);
    });

    it('gera os meses que faltam e marca o último gerado', async () => {
        vi.mocked(repo.listRecurrencesToGenerate).mockResolvedValue([rec()] as never);
        const uc = new GenerateFinanceRecurrencesUseCase(repo);
        const r = await uc.execute(new Date(2026, 2, 15)); // março/2026
        expect(r.created).toBe(3);
        const meses = vi.mocked(repo.createRecurrenceTransaction).mock.calls.map(c => c[0].recurringMonth);
        expect(meses).toEqual(['2026-01', '2026-02', '2026-03']);
        expect(repo.setRecurrenceLastGeneratedMonth).toHaveBeenCalledWith('rec-1', '2026-03');
    });

    it('não repete o mês já gerado — rodar duas vezes cria uma vez só', async () => {
        vi.mocked(repo.listRecurrencesToGenerate).mockResolvedValue([rec({ startMonth: '2026-03' })] as never);
        const uc = new GenerateFinanceRecurrencesUseCase(repo);
        const first = await uc.execute(new Date(2026, 2, 15));
        expect(first.created).toBe(1);

        // Segunda passada: o repositório já devolve com lastGeneratedMonth preenchido.
        vi.mocked(repo.listRecurrencesToGenerate).mockResolvedValue([
            rec({ startMonth: '2026-03',
lastGeneratedMonth: '2026-03' }),
        ] as never);
        vi.mocked(repo.createRecurrenceTransaction).mockClear();
        const second = await uc.execute(new Date(2026, 2, 20));
        expect(second.created).toBe(0);
        expect(repo.createRecurrenceTransaction).not.toHaveBeenCalled();
    });

    it('lançamento já existente no banco (unique) não é contado', async () => {
        vi.mocked(repo.listRecurrencesToGenerate).mockResolvedValue([rec({ startMonth: '2026-02' })] as never);
        vi.mocked(repo.createRecurrenceTransaction)
            .mockResolvedValueOnce(false) // fevereiro já estava lá
            .mockResolvedValueOnce(true);
        const uc = new GenerateFinanceRecurrencesUseCase(repo);
        const r = await uc.execute(new Date(2026, 2, 1));
        expect(r.created).toBe(1);
        // Mesmo assim avança o marcador, para não refazer o caminho todo depois.
        expect(repo.setRecurrenceLastGeneratedMonth).toHaveBeenCalledWith('rec-1', '2026-03');
    });

    it('usa o último dia em meses curtos', async () => {
        vi.mocked(repo.listRecurrencesToGenerate).mockResolvedValue([
            rec({ dayOfMonth: 31,
startMonth: '2026-02' }),
        ] as never);
        const uc = new GenerateFinanceRecurrencesUseCase(repo);
        await uc.execute(new Date(2026, 1, 5)); // fevereiro/2026
        const date = vi.mocked(repo.createRecurrenceTransaction).mock.calls[0][0].date;
        expect(date.toISOString().slice(0, 10)).toBe('2026-02-28');
    });

    it('para no mês final e não toca no marcador quando não há nada a gerar', async () => {
        vi.mocked(repo.listRecurrencesToGenerate).mockResolvedValue([
            rec({ endMonth: '2026-02',
lastGeneratedMonth: '2026-02' }),
        ] as never);
        const uc = new GenerateFinanceRecurrencesUseCase(repo);
        const r = await uc.execute(new Date(2026, 8, 1));
        expect(r.created).toBe(0);
        expect(repo.setRecurrenceLastGeneratedMonth).not.toHaveBeenCalled();
    });

    it('copia valor, categoria, caixa e forma de pagamento para o lançamento', async () => {
        vi.mocked(repo.listRecurrencesToGenerate).mockResolvedValue([
            rec({ startMonth: '2026-03',
categoryId: 'cat-1',
accountId: 'acc-1' }),
        ] as never);
        const uc = new GenerateFinanceRecurrencesUseCase(repo);
        await uc.execute(new Date(2026, 2, 1));
        const run = vi.mocked(repo.createRecurrenceTransaction).mock.calls[0][0];
        expect(run).toMatchObject({
            recurringId: 'rec-1',
            type: 'OUT',
            amountCents: 250000,
            description: 'ALUGUEL DA SEDE',
            method: 'PIX',
            categoryId: 'cat-1',
            accountId: 'acc-1',
        });
    });
});

describe('DeleteFinanceRecurrenceUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('apaga só o molde (soft-delete) e devolve 404 quando não existe', async () => {
        vi.mocked(repo.softDeleteRecurrence).mockResolvedValue(true);
        const uc = new DeleteFinanceRecurrenceUseCase(repo);
        expect((await uc.execute('rec-1')).error).toBeUndefined();

        vi.mocked(repo.softDeleteRecurrence).mockResolvedValue(false);
        expect((await uc.execute('rec-x')).error).toBeDefined();
    });
});
