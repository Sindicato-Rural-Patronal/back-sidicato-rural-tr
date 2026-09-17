import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateFinanceTransferUseCase } from '../create-finance-transfer.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const repo = {
    findAccountById: vi.fn(),
    createTransfer: vi.fn(),
} as unknown as FinanceRepository;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const base = { fromAccountId: A,
toAccountId: B,
amountCents: 5000,
date: '2026-09-01' };

describe('CreateFinanceTransferUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejeita origem igual ao destino', async () => {
        const uc = new CreateFinanceTransferUseCase(repo);
        const r = await uc.execute({ ...base,
toAccountId: A }, null);
        expect(r.error?.message).toContain('diferentes');
        expect(repo.createTransfer).not.toHaveBeenCalled();
    });

    it('rejeita valor zero', async () => {
        const uc = new CreateFinanceTransferUseCase(repo);
        const r = await uc.execute({ ...base,
amountCents: 0 }, null);
        expect(r.error).toBeDefined();
        expect(repo.createTransfer).not.toHaveBeenCalled();
    });

    it('rejeita caixa de origem inexistente', async () => {
        vi.mocked(repo.findAccountById).mockImplementation(async (id: string) => (id === B ? { id: B,
name: 'Banco' } : null) as any);
        const uc = new CreateFinanceTransferUseCase(repo);
        const r = await uc.execute(base, null);
        expect(r.error?.message).toContain('origem');
        expect(repo.createTransfer).not.toHaveBeenCalled();
    });

    it('rejeita caixa de destino inexistente', async () => {
        vi.mocked(repo.findAccountById).mockImplementation(async (id: string) => (id === A ? { id: A,
name: 'Dinheiro' } : null) as any);
        const uc = new CreateFinanceTransferUseCase(repo);
        const r = await uc.execute(base, null);
        expect(r.error?.message).toContain('destino');
    });

    it('cria transferência válida com descrição padrão', async () => {
        vi.mocked(repo.findAccountById).mockImplementation(async (id: string) =>
            (id === A ? { id: A,
name: 'Dinheiro' } : { id: B,
name: 'Banco' }) as any);
        vi.mocked(repo.createTransfer).mockResolvedValue(undefined as any);
        const uc = new CreateFinanceTransferUseCase(repo);
        const r = await uc.execute(base, 'admin-1');
        expect(r.error).toBeUndefined();
        const arg = vi.mocked(repo.createTransfer).mock.calls[0][0];
        expect(arg.amountCents).toBe(5000);
        expect(arg.fromAccountId).toBe(A);
        expect(arg.toAccountId).toBe(B);
        expect(arg.description).toContain('Dinheiro');
        expect(arg.description).toContain('Banco');
        expect(arg.createdBy).toBe('admin-1');
    });
});
