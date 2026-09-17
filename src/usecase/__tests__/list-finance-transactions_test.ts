import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListFinanceTransactionsUseCase, financeTotals } from '../list-finance-transactions.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const repo = {
    listTransactions: vi.fn(),
    sumTransactions: vi.fn(),
} as unknown as FinanceRepository;

const CAT = '11111111-1111-4111-8111-111111111111';

describe('financeTotals', () => {
    it('soma entradas e saídas', () => {
        expect(financeTotals([
            { type: 'IN',
transfer: false,
amountCents: 10000 },
            { type: 'OUT',
transfer: false,
amountCents: 2500 },
        ])).toEqual({ incomeCents: 10000,
expenseCents: 2500 });
    });

    it('ignora transferências entre caixas e "só nota"', () => {
        expect(financeTotals([
            { type: 'IN',
transfer: false,
amountCents: 700 },
            { type: 'IN',
transfer: true,
amountCents: 5000 },
            { type: 'OUT',
transfer: true,
amountCents: 5000 },
            { type: null,
transfer: false,
amountCents: 9900 },
        ])).toEqual({ incomeCents: 700,
expenseCents: 0 });
    });

    it('sem lançamentos → zero', () => {
        expect(financeTotals([])).toEqual({ incomeCents: 0,
expenseCents: 0 });
    });
});

describe('ListFinanceTransactionsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('devolve a página e os totais de todo o conjunto filtrado', async () => {
        vi.mocked(repo.listTransactions).mockResolvedValue({ items: [{ id: 'tx-1' }] as any,
total: 41 });
        vi.mocked(repo.sumTransactions).mockResolvedValue([
            { type: 'IN',
transfer: false,
amountCents: 30000 },
            { type: 'OUT',
transfer: false,
amountCents: 12000 },
        ]);
        const uc = new ListFinanceTransactionsUseCase(repo);
        const r = await uc.execute({ page: '3',
limit: '20' });
        expect(r.total).toBe(41);
        expect(r.page).toBe(3);
        expect(r.totalPages).toBe(3);
        expect(r.totals).toEqual({ incomeCents: 30000,
expenseCents: 12000 });
        expect(repo.listTransactions).toHaveBeenCalledWith(expect.objectContaining({ skip: 40,
take: 20 }));
    });

    it('usa os mesmos filtros na lista e nas somas (sem paginação nas somas)', async () => {
        vi.mocked(repo.listTransactions).mockResolvedValue({ items: [],
total: 0 });
        vi.mocked(repo.sumTransactions).mockResolvedValue([]);
        const uc = new ListFinanceTransactionsUseCase(repo);
        await uc.execute({ from: '2026-09-01',
to: '2026-09-30',
type: 'OUT',
categoryId: CAT,
search: 'luz' });

        const sumFilters = vi.mocked(repo.sumTransactions).mock.calls[0][0];
        const { skip, take, ...listFilters } = vi.mocked(repo.listTransactions).mock.calls[0][0];
        expect(skip).toBe(0);
        expect(take).toBe(20);
        expect(sumFilters).toEqual(listFilters);
        expect(sumFilters).not.toHaveProperty('skip');
        expect(sumFilters.type).toBe('OUT');
        expect(sumFilters.categoryId).toBe(CAT);
        expect(sumFilters.search).toBe('luz');
        // `to` inclui o dia inteiro
        expect(sumFilters.to?.toISOString()).toBe('2026-09-30T23:59:59.999Z');
    });
});
