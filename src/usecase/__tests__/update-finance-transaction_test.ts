import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateFinanceTransactionUseCase } from '../update-finance-transaction.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';
import { ConflictError } from '../../errors/conflict.js';

const repo = {
    findTransactionById: vi.fn(),
    findCategoryById: vi.fn(),
    findAccountById: vi.fn(),
    updateTransaction: vi.fn(),
    findClosedMonths: vi.fn().mockResolvedValue([]),
} as unknown as FinanceRepository;

const ACC = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const closedSept = [{
    accountId: ACC,
    month: '2026-09',
    accountName: 'BANCO',
}];

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
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1',
type: 'OUT',
transferId: 'trf-1' } as any);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1', { description: 'novo' });
        expect(r.error?.message).toContain('Transferências não podem ser editadas');
        expect(repo.updateTransaction).not.toHaveBeenCalled();
    });

    it('rejeita categoria de tipo diferente (usa o tipo efetivo)', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1',
type: 'OUT',
transferId: null } as any);
        vi.mocked(repo.findCategoryById).mockResolvedValue({ id: 'c1',
type: 'IN' } as any);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1', { categoryId: '11111111-1111-4111-8111-111111111111' });
        expect(r.error?.message).toContain('não corresponde ao tipo');
        expect(repo.updateTransaction).not.toHaveBeenCalled();
    });

    it('converte "só nota" (sem tipo) em entrada', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1',
type: null,
transferId: null,
categoryId: null } as any);
        vi.mocked(repo.updateTransaction).mockResolvedValue({ result: { id: 'tx-1' } } as any);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1', { type: 'IN' });
        expect(r.error).toBeUndefined();
        expect(repo.updateTransaction).toHaveBeenCalled();
    });

    it('atualiza lançamento normal válido', async () => {
        vi.mocked(repo.findTransactionById).mockResolvedValue({ id: 'tx-1',
type: 'OUT',
transferId: null } as any);
        vi.mocked(repo.updateTransaction).mockResolvedValue({ result: { id: 'tx-1',
number: 12 } } as any);
        const uc = new UpdateFinanceTransactionUseCase(repo);
        const r = await uc.execute('tx-1', { description: 'atualizado',
amountCents: 15000 });
        expect(r.error).toBeUndefined();
        expect(repo.updateTransaction).toHaveBeenCalled();
        // Devolve o lançamento como ficou (com o número).
        expect(r.transaction).toEqual({ id: 'tx-1',
number: 12 });
    });

    describe('Nº do lançamento (SR-064)', () => {
        const tx = { id: 'tx-1',
type: 'OUT',
transferId: null,
number: 12 };

        it('passa o número corrigido ao repositório e devolve o lançamento', async () => {
            vi.mocked(repo.findTransactionById).mockResolvedValue(tx as any);
            vi.mocked(repo.updateTransaction).mockResolvedValue({ result: { ...tx,
number: 15 } } as any);
            const r = await new UpdateFinanceTransactionUseCase(repo).execute('tx-1', { number: 15 });
            expect(r.error).toBeUndefined();
            expect(vi.mocked(repo.updateTransaction).mock.calls[0][1].number).toBe(15);
            expect(r.transaction?.number).toBe(15);
        });

        it('número de outro lançamento → 409 com a mensagem da decisão', async () => {
            vi.mocked(repo.findTransactionById).mockResolvedValue(tx as any);
            vi.mocked(repo.updateTransaction).mockResolvedValue({ conflict: { number: 15,
deleted: false } } as any);
            const r = await new UpdateFinanceTransactionUseCase(repo).execute('tx-1', { number: 15 });
            expect(r.error).toBeInstanceOf(ConflictError);
            expect(r.error?.message).toBe('O número 15 já é de outro lançamento.');
        });

        it('número de um lançamento excluído → 409 que diz isso', async () => {
            vi.mocked(repo.findTransactionById).mockResolvedValue(tx as any);
            vi.mocked(repo.updateTransaction).mockResolvedValue({ conflict: { number: 3,
deleted: true } } as any);
            const r = await new UpdateFinanceTransactionUseCase(repo).execute('tx-1', { number: 3 });
            expect(r.error?.message).toBe('O número 3 já é de um lançamento excluído.');
        });

        it.each([null, 0, -1, 1.5, '12'])('recusa %s (400) e não grava', async value => {
            vi.mocked(repo.findTransactionById).mockResolvedValue(tx as any);
            const r = await new UpdateFinanceTransactionUseCase(repo).execute('tx-1', { number: value });
            expect(r.error).toBeDefined();
            expect(r.error).not.toBeInstanceOf(ConflictError);
            expect(repo.updateTransaction).not.toHaveBeenCalled();
        });
    });

    describe('mês fechado (SR-054)', () => {
        const septTx = {
            id: 'tx-1',
            type: 'OUT',
            transferId: null,
            accountId: ACC,
            date: new Date('2026-09-10T00:00:00.000Z'),
        };

        it('não edita lançamento que está num mês fechado', async () => {
            vi.mocked(repo.findTransactionById).mockResolvedValue(septTx as any);
            vi.mocked(repo.findClosedMonths).mockResolvedValueOnce(closedSept);
            const uc = new UpdateFinanceTransactionUseCase(repo);
            const r = await uc.execute('tx-1', { description: 'outra' });
            expect(r.error?.message).toContain('O mês 09/2026 está fechado');
            expect(repo.updateTransaction).not.toHaveBeenCalled();
        });

        it('confere o mês de antes e o de depois (mover para fora e para dentro)', async () => {
            vi.mocked(repo.findTransactionById).mockResolvedValue(septTx as any);
            vi.mocked(repo.findAccountById).mockResolvedValue({ id: OTHER } as any);
            vi.mocked(repo.updateTransaction).mockResolvedValue({ result: { id: 'tx-1' } } as any);
            const uc = new UpdateFinanceTransactionUseCase(repo);
            const r = await uc.execute('tx-1', {
                date: '2026-10-02',
                accountId: OTHER,
            });
            expect(r.error).toBeUndefined();
            expect(repo.findClosedMonths).toHaveBeenCalledWith([
                {
                    accountId: ACC,
                    month: '2026-09',
                },
                {
                    accountId: OTHER,
                    month: '2026-10',
                },
            ]);
        });

        it('não move lançamento para dentro de um mês fechado', async () => {
            vi.mocked(repo.findTransactionById).mockResolvedValue({
                ...septTx,
                date: new Date('2026-10-05T00:00:00.000Z'),
            } as any);
            vi.mocked(repo.findClosedMonths).mockResolvedValueOnce(closedSept);
            const uc = new UpdateFinanceTransactionUseCase(repo);
            const r = await uc.execute('tx-1', { date: '2026-09-30' });
            expect(r.error?.message).toContain('09/2026');
            expect(repo.updateTransaction).not.toHaveBeenCalled();
        });

        it('tirar o caixa (accountId null) só confere o caixa de antes', async () => {
            vi.mocked(repo.findTransactionById).mockResolvedValue(septTx as any);
            vi.mocked(repo.updateTransaction).mockResolvedValue({ result: { id: 'tx-1' } } as any);
            const uc = new UpdateFinanceTransactionUseCase(repo);
            const r = await uc.execute('tx-1', { accountId: null });
            expect(r.error).toBeUndefined();
            expect(repo.findClosedMonths).toHaveBeenCalledWith([{
                accountId: ACC,
                month: '2026-09',
            }]);
        });
    });
});
