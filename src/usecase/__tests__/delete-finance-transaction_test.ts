import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteFinanceTransactionUseCase } from '../delete-finance-transaction.js';
import { BusinessRuleError } from '../../errors/business-rule.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const repo = {
    findTransactionById: vi.fn(),
    softDeleteTransaction: vi.fn(),
    softDeleteTransfer: vi.fn(),
    listTransferLegs: vi.fn(),
    findClosedMonths: vi.fn().mockResolvedValue([]),
} as unknown as FinanceRepository;

describe('DeleteFinanceTransactionUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('falha se não existir', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue(null);
        const uc = new DeleteFinanceTransactionUseCase(repo);
        const r = await uc.execute('x');
        expect(r.error).toBeDefined();
    });

    it('lançamento normal → soft-delete só dele', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1',
transferId: null } as any);
        vi.mocked(repo.softDeleteTransaction).mockResolvedValue(true);
        const uc = new DeleteFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1');
        expect(r.error).toBeUndefined();
        expect(repo.softDeleteTransaction).toHaveBeenCalledWith('tx-1');
        expect(repo.softDeleteTransfer).not.toHaveBeenCalled();
    });

    it('transferência → apaga os dois lados pelo transferId', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1',
transferId: 'trf-9' } as any);
        vi.mocked(repo.listTransferLegs).mockResolvedValue([] as any);
        vi.mocked(repo.softDeleteTransfer).mockResolvedValue(true);
        const uc = new DeleteFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1');
        expect(r.error).toBeUndefined();
        expect(repo.softDeleteTransfer).toHaveBeenCalledWith('trf-9');
        expect(repo.softDeleteTransaction).not.toHaveBeenCalled();
    });

    it('mês fechado: não apaga o lançamento (SR-054)', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({
            id: 'tx-1',
            transferId: null,
            accountId: 'acc-1',
            date: new Date('2026-09-10T00:00:00.000Z'),
        } as any);
        vi.mocked(repo.findClosedMonths).mockResolvedValueOnce([{
            accountId: 'acc-1',
            month: '2026-09',
            accountName: 'BANCO',
        }]);
        const uc = new DeleteFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1');
        expect(r.error).toBeInstanceOf(BusinessRuleError);
        expect(repo.softDeleteTransaction).not.toHaveBeenCalled();
    });

    it('transferência: confere as duas pernas e não apaga nenhuma se uma está fechada', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1',
transferId: 'trf-9' } as any);
        vi.mocked(repo.listTransferLegs).mockResolvedValue([
            {
                id: 'tx-1',
                accountId: 'acc-1',
                date: new Date('2026-09-10T00:00:00.000Z'),
            },
            {
                id: 'tx-2',
                accountId: 'acc-2',
                date: new Date('2026-09-10T00:00:00.000Z'),
            },
        ] as any);
        vi.mocked(repo.findClosedMonths).mockResolvedValueOnce([{
            accountId: 'acc-2',
            month: '2026-09',
            accountName: 'COFRE',
        }]);
        const uc = new DeleteFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1');
        expect(r.error?.message).toContain('"COFRE"');
        expect(repo.findClosedMonths).toHaveBeenCalledWith([
            {
                accountId: 'acc-1',
                month: '2026-09',
            },
            {
                accountId: 'acc-2',
                month: '2026-09',
            },
        ]);
        expect(repo.softDeleteTransfer).not.toHaveBeenCalled();
    });
});
