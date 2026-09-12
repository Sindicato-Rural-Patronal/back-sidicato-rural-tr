import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateFinanceTransactionUseCase } from '../create-finance-transaction.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const repo = {
    findCategoryById: vi.fn(),
    findAccountById: vi.fn(),
    createTransaction: vi.fn(),
} as unknown as FinanceRepository;

const base = {
    type: 'OUT' as const,
    amountCents: 23000,
    date: '2026-09-01',
    description: 'Compra de gás',
};

describe('CreateFinanceTransactionUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejeita valor zero ou negativo', async () => {
        const uc = new CreateFinanceTransactionUseCase(repo);
        const r = await uc.execute({ ...base, amountCents: 0 }, null);
        expect(r.error).toBeDefined();
        expect(repo.createTransaction).not.toHaveBeenCalled();
    });

    it('rejeita sem descrição', async () => {
        const uc = new CreateFinanceTransactionUseCase(repo);
        const r = await uc.execute({ ...base, description: '' }, null);
        expect(r.error).toBeDefined();
    });

    it('cria lançamento válido sem categoria/caixa', async () => {
        vi.mocked(repo.createTransaction).mockResolvedValue({ id: 'tx-1' } as any);
        const uc = new CreateFinanceTransactionUseCase(repo);
        const r = await uc.execute(base, 'admin-1');
        expect(r.error).toBeUndefined();
        expect(r.transaction).toBeDefined();
        // valor persiste como centavos inteiros
        expect(vi.mocked(repo.createTransaction).mock.calls[0][0].amountCents).toBe(23000);
        expect(vi.mocked(repo.createTransaction).mock.calls[0][0].createdBy).toBe('admin-1');
    });

    it('rejeita categoria inexistente', async () => {
        vi.mocked(repo.findCategoryById).mockResolvedValue(null);
        const uc = new CreateFinanceTransactionUseCase(repo);
        const r = await uc.execute({ ...base, categoryId: '11111111-1111-4111-8111-111111111111' }, null);
        expect(r.error?.message).toContain('Categoria inválida');
        expect(repo.createTransaction).not.toHaveBeenCalled();
    });

    it('rejeita categoria de tipo diferente do lançamento', async () => {
        vi.mocked(repo.findCategoryById).mockResolvedValue({ id: 'c1', type: 'IN' } as any);
        const uc = new CreateFinanceTransactionUseCase(repo);
        const r = await uc.execute({ ...base, type: 'OUT', categoryId: '11111111-1111-4111-8111-111111111111' }, null);
        expect(r.error?.message).toContain('não corresponde ao tipo');
        expect(repo.createTransaction).not.toHaveBeenCalled();
    });

    it('rejeita caixa inexistente', async () => {
        vi.mocked(repo.findAccountById).mockResolvedValue(null);
        const uc = new CreateFinanceTransactionUseCase(repo);
        const r = await uc.execute({ ...base, accountId: '22222222-2222-4222-8222-222222222222' }, null);
        expect(r.error?.message).toContain('Caixa inválido');
        expect(repo.createTransaction).not.toHaveBeenCalled();
    });

    it('aceita categoria/caixa válidos', async () => {
        vi.mocked(repo.findCategoryById).mockResolvedValue({ id: 'c1', type: 'OUT' } as any);
        vi.mocked(repo.findAccountById).mockResolvedValue({ id: 'a1' } as any);
        vi.mocked(repo.createTransaction).mockResolvedValue({ id: 'tx-2' } as any);
        const uc = new CreateFinanceTransactionUseCase(repo);
        const r = await uc.execute({
            ...base,
            categoryId: '11111111-1111-4111-8111-111111111111',
            accountId: '22222222-2222-4222-8222-222222222222',
        }, null);
        expect(r.error).toBeUndefined();
        expect(r.transaction).toBeDefined();
    });
});
