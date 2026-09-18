import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    normalizePaymentMethodName,
    CreateFinancePaymentMethodUseCase,
    UpdateFinancePaymentMethodUseCase,
    DeleteFinancePaymentMethodUseCase,
} from '../finance-payment-methods.js';
import { ListFinanceTransactionsUseCase } from '../list-finance-transactions.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const repo = {
    findPaymentMethodByName: vi.fn(),
    createPaymentMethod: vi.fn(),
    updatePaymentMethod: vi.fn(),
    softDeletePaymentMethod: vi.fn(),
    listTransactions: vi.fn(),
    sumTransactions: vi.fn(),
} as unknown as FinanceRepository;

describe('normalizePaymentMethodName', () => {
    it('tira espaços e sobe para caixa alta', () => {
        expect(normalizePaymentMethodName('  pix ')).toBe('PIX');
        expect(normalizePaymentMethodName('Pix')).toBe('PIX');
        expect(normalizePaymentMethodName('cartao  de credito')).toBe('CARTAO DE CREDITO');
        expect(normalizePaymentMethodName('transferência')).toBe('TRANSFERÊNCIA');
    });
});

describe('CreateFinancePaymentMethodUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('grava o nome normalizado', async () => {
        vi.mocked(repo.findPaymentMethodByName).mockResolvedValue(null);
        vi.mocked(repo.createPaymentMethod).mockResolvedValue({ id: 'pm-1',
name: 'PIX' } as never);
        const uc = new CreateFinancePaymentMethodUseCase(repo);
        const r = await uc.execute({ name: ' pix ' });
        expect(r.error).toBeUndefined();
        expect(vi.mocked(repo.createPaymentMethod).mock.calls[0][0].name).toBe('PIX');
    });

    it('recusa nome repetido (409)', async () => {
        vi.mocked(repo.findPaymentMethodByName).mockResolvedValue({
            id: 'pm-1',
name: 'PIX',
active: true,
isDeleted: false,
        } as never);
        const uc = new CreateFinancePaymentMethodUseCase(repo);
        const r = await uc.execute({ name: 'Pix' });
        expect(r.error?.message).toContain('Já existe');
        expect(repo.createPaymentMethod).not.toHaveBeenCalled();
    });

    it('reativa em vez de duplicar quando o nome já existia desativado', async () => {
        vi.mocked(repo.findPaymentMethodByName).mockResolvedValue({
            id: 'pm-1',
name: 'CHEQUE',
active: false,
isDeleted: true,
        } as never);
        vi.mocked(repo.updatePaymentMethod).mockResolvedValue({ id: 'pm-1',
name: 'CHEQUE' } as never);
        const uc = new CreateFinancePaymentMethodUseCase(repo);
        const r = await uc.execute({ name: 'cheque' });
        expect(r.error).toBeUndefined();
        expect(repo.updatePaymentMethod).toHaveBeenCalledWith('pm-1', { active: true });
        expect(repo.createPaymentMethod).not.toHaveBeenCalled();
    });

    it('recusa nome vazio', async () => {
        const uc = new CreateFinancePaymentMethodUseCase(repo);
        expect((await uc.execute({ name: '   ' })).error).toBeDefined();
    });
});

describe('UpdateFinancePaymentMethodUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('recusa renomear para um nome que já é de outra forma', async () => {
        vi.mocked(repo.findPaymentMethodByName).mockResolvedValue({ id: 'pm-2' } as never);
        const uc = new UpdateFinancePaymentMethodUseCase(repo);
        const r = await uc.execute('pm-1', { name: 'pix' });
        expect(r.error?.message).toContain('Já existe');
    });

    it('deixa só desativar, sem mexer no nome', async () => {
        vi.mocked(repo.updatePaymentMethod).mockResolvedValue({ id: 'pm-1' } as never);
        const uc = new UpdateFinancePaymentMethodUseCase(repo);
        const r = await uc.execute('pm-1', { active: false });
        expect(r.error).toBeUndefined();
        expect(repo.updatePaymentMethod).toHaveBeenCalledWith('pm-1', { active: false });
    });
});

describe('DeleteFinancePaymentMethodUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('404 quando não existe', async () => {
        vi.mocked(repo.softDeletePaymentMethod).mockResolvedValue(false);
        const uc = new DeleteFinancePaymentMethodUseCase(repo);
        expect((await uc.execute('pm-x')).error).toBeDefined();
    });
});

describe('filtro por forma de pagamento nos lançamentos', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.listTransactions).mockResolvedValue({ items: [],
total: 0 } as never);
        vi.mocked(repo.sumTransactions).mockResolvedValue([] as never);
    });

    it('passa `method` adiante', async () => {
        const uc = new ListFinanceTransactionsUseCase(repo);
        await uc.execute({ method: 'PIX' });
        expect(vi.mocked(repo.listTransactions).mock.calls[0][0].method).toBe('PIX');
        expect(vi.mocked(repo.sumTransactions).mock.calls[0][0].method).toBe('PIX');
    });

    it('trata "" como sem filtro', async () => {
        const uc = new ListFinanceTransactionsUseCase(repo);
        await uc.execute({ method: '' });
        expect(vi.mocked(repo.listTransactions).mock.calls[0][0].method).toBeUndefined();
    });
});
