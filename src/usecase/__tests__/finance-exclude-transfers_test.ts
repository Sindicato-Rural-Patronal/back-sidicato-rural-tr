import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListFinanceTransactionsUseCase } from '../list-finance-transactions.js';
import { ExportDataUseCase } from '../export-data.js';
import { EXPORT_SOURCES } from '../export/catalog/index.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { readXlsx } from '../../lib/__tests__/xlsx-reader.js';

// Filtro `excludeTransfers` (SR-135): lista, totais e exportação dos lançamentos.

const LABEL = 'Sem transferências entre caixas';

describe('lista de lançamentos', () => {
    const repo = {
        listTransactions: vi.fn(),
        sumTransactions: vi.fn(),
    } as unknown as FinanceRepository;
    const useCase = () => new ListFinanceTransactionsUseCase(repo);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.listTransactions).mockResolvedValue({ items: [],
total: 0 });
        vi.mocked(repo.sumTransactions).mockResolvedValue([]);
    });

    it.each([['true', true], [true, true]])('%s chega à lista e aos totais', async (value, expected) => {
        await useCase().execute({ excludeTransfers: value });
        expect(vi.mocked(repo.listTransactions).mock.calls[0][0].excludeTransfers).toBe(expected);
        expect(vi.mocked(repo.sumTransactions).mock.calls[0][0].excludeTransfers).toBe(expected);
    });

    it.each([[undefined], [''], ['false'], [false]])('%s vale como ausente', async value => {
        await useCase().execute({ excludeTransfers: value });
        expect(vi.mocked(repo.listTransactions).mock.calls[0][0].excludeTransfers).toBeUndefined();
        expect(vi.mocked(repo.sumTransactions).mock.calls[0][0].excludeTransfers).toBeUndefined();
    });

    it('valor inválido → erro de parâmetro, sem consultar o banco', async () => {
        await expect(useCase().execute({ excludeTransfers: 'talvez' })).rejects.toThrow('excludeTransfers');
        expect(repo.listTransactions).not.toHaveBeenCalled();
    });
});

describe('exportação dos lançamentos', () => {
    const repo = {
        financeTransactions: vi.fn(),
        financeNames: vi.fn(),
    } as unknown as ExportRepository;
    const useCase = () => new ExportDataUseCase(repo, () => new Date('2026-09-17T13:00:00.000Z'));
    const FIELDS = ['number', 'type', 'description', 'amount'];

    const row = (n: number, overrides: Record<string, unknown> = {}) => ({
        id: `t${n}`,
        number: n,
        type: 'IN',
        amountCents: 10000,
        date: new Date('2026-05-10T00:00:00.000Z'),
        description: `Lançamento ${n}`,
        method: 'PIX',
        notes: null,
        transferId: null,
        recurringId: null,
        empenho: null,
        category: null,
        account: null,
        attachments: [],
        createdAt: new Date('2026-05-10T15:30:00.000Z'),
        ...overrides,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.financeTransactions).mockResolvedValue([row(1), row(2, { type: 'OUT',
amountCents: 4000 })] as never);
    });

    it('o rótulo está no catálogo', () => {
        expect(EXPORT_SOURCES['finance-transactions'].filterLabels).toMatchObject({ excludeTransfers: LABEL });
    });

    it('o filtro chega à consulta (GET "true" e POST boolean)', async () => {
        for (const value of ['true', true]) {
            vi.mocked(repo.financeTransactions).mockClear();
            const r = await useCase().execute('finance-transactions', { excludeTransfers: value });
            expect(r.error).toBeUndefined();
            expect(vi.mocked(repo.financeTransactions).mock.calls[0][0].excludeTransfers).toBe(true);
        }
    });

    it('PDF: o rótulo na linha de filtros, sem a nota, e a auditoria diz "com filtros"', async () => {
        const r = await useCase().execute('finance-transactions', { fields: FIELDS,
excludeTransfers: 'true',
format: 'pdf' });
        expect(r.result!.pdf).toMatchObject({ filters: LABEL });
        expect(r.result!.pdf).toHaveProperty('totais');
        expect('notaDosTotais' in r.result!.pdf!).toBe(false);
        expect(r.result!.auditDetails).toMatchObject({ escopo: 'com filtros',
filtros: [{ nome: LABEL,
valor: 'Sim' }] });
    });

    it('junto de outros filtros, o rótulo vem depois deles', async () => {
        const r = await useCase().execute('finance-transactions', { fields: FIELDS,
type: 'IN',
search: 'x',
excludeTransfers: true,
format: 'pdf' });
        expect(r.result!.pdf!.filters).toBe(`Tipo: Entrada · Busca: x · ${LABEL}`);
    });

    it('Excel: o rótulo na aba "Sobre", sem a nota', async () => {
        const r = await useCase().execute('finance-transactions', { fields: FIELDS,
excludeTransfers: true,
format: 'xlsx' });
        const { sheets: [dados, sobre] } = readXlsx(r.result!.xlsx!);
        expect(sobre.rows.find(([k]) => k === 'Filtros')).toEqual(['Filtros', LABEL]);
        expect(JSON.stringify([dados.rows, sobre.rows])).not.toContain('Transferências entre caixas não entram');
    });

    it('false e ausente: nada muda (sem rótulo, escopo "todos")', async () => {
        for (const body of [{}, { excludeTransfers: 'false' }, { excludeTransfers: false }, { excludeTransfers: '' }]) {
            vi.mocked(repo.financeTransactions).mockClear();
            const r = await useCase().execute('finance-transactions', { ...body,
fields: FIELDS,
format: 'pdf' });
            expect(r.result!.pdf!.filters).toBe('');
            expect(r.result!.auditDetails).toMatchObject({ escopo: 'todos',
filtros: [] });
            expect(vi.mocked(repo.financeTransactions).mock.calls[0][0].excludeTransfers).toBeUndefined();
        }
    });

    it('valor inválido → 400 "Parâmetro inválido: excludeTransfers"', async () => {
        const r = await useCase().execute('finance-transactions', { excludeTransfers: 'talvez' });
        expect(r.error?.message).toBe('Parâmetro inválido: excludeTransfers');
        expect(repo.financeTransactions).not.toHaveBeenCalled();
    });
});
