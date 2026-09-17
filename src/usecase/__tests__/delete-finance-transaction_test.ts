import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteFinanceTransactionUseCase } from '../delete-finance-transaction.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const repo = {
    findTransactionById: vi.fn(),
    softDeleteTransaction: vi.fn(),
    softDeleteTransfer: vi.fn(),
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
        vi.mocked(repo.softDeleteTransfer).mockResolvedValue(true);
        const uc = new DeleteFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1');
        expect(r.error).toBeUndefined();
        expect(repo.softDeleteTransfer).toHaveBeenCalledWith('trf-9');
        expect(repo.softDeleteTransaction).not.toHaveBeenCalled();
    });
});
