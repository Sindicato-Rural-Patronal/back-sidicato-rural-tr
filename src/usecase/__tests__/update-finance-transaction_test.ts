import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateFinanceTransactionUseCase } from '../update-finance-transaction.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const repo = {
    findTransactionById: vi.fn(),
    findCategoryById: vi.fn(),
    findAccountById: vi.fn(),
    updateTransaction: vi.fn(),
} as unknown as FinanceRepository;

describe('UpdateFinanceTransactionUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('falha se não existir', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue(null);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('x', { description: 'novo' });
        expect(r.error).toBeDefined();
        expect(repo.updateTransaction).not.toHaveBeenCalled();
    });

    it('bloqueia editar uma transferência', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1', type: 'OUT', transferId: 'trf-1' } as any);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1', { description: 'novo' });
        expect(r.error?.message).toContain('Transferências não podem ser editadas');
        expect(repo.updateTransaction).not.toHaveBeenCalled();
    });

    it('rejeita categoria de tipo diferente (usa o tipo efetivo)', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1', type: 'OUT', transferId: null } as any);
        vi.mocked(repo.findCategoryById).mockResolvedValue({ id: 'c1', type: 'IN' } as any);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1', { categoryId: '11111111-1111-4111-8111-111111111111' });
        expect(r.error?.message).toContain('não corresponde ao tipo');
        expect(repo.updateTransaction).not.toHaveBeenCalled();
    });

    it('converte "só nota" (sem tipo) em entrada', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1', type: null, transferId: null, categoryId: null } as any);
        vi.mocked(repo.updateTransaction).mockResolvedValue({ id: 'tx-1' } as any);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1', { type: 'IN' });
        expect(r.error).toBeUndefined();
        expect(repo.updateTransaction).toHaveBeenCalled();
    });

    it('atualiza lançamento normal válido', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1', type: 'OUT', transferId: null } as any);
        vi.mocked(repo.updateTransaction).mockResolvedValue({ id: 'tx-1' } as any);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1', { description: 'atualizado', amountCents: 15000 });
        expect(r.error).toBeUndefined();
        expect(repo.updateTransaction).toHaveBeenCalled();
    });
});
