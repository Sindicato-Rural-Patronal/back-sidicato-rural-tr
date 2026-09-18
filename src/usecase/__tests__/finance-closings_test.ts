import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    computeClosing,
    monthRange,
    CreateFinanceClosingUseCase,
    DeleteFinanceClosingUseCase,
    PreviewFinanceClosingUseCase,
} from '../finance-closings.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const ACC = '11111111-1111-4111-8111-111111111111';

const repo = {
    findAccountById: vi.fn(),
    findClosing: vi.fn(),
    accountMonthMovement: vi.fn(),
    createClosing: vi.fn(),
    deleteClosing: vi.fn(),
} as unknown as FinanceRepository;

describe('monthRange', () => {
    it('cobre o mês inteiro', () => {
        const { from, to } = monthRange('2026-02');
        expect(from.toISOString()).toBe('2026-02-01T00:00:00.000Z');
        expect(to.toISOString()).toBe('2026-02-28T23:59:59.999Z');
    });

    it('acerta o fim do ano', () => {
        const { to } = monthRange('2026-12');
        expect(to.toISOString()).toBe('2026-12-31T23:59:59.999Z');
    });
});

describe('computeClosing', () => {
    it('esperado = abertura + entradas − saídas', () => {
        const r = computeClosing({ openingCents: 100000,
inCents: 50000,
outCents: 20000 }, 130000);
        expect(r.expectedBalanceCents).toBe(130000);
        expect(r.differenceCents).toBe(0);
    });

    it('sobra vira diferença positiva; falta, negativa', () => {
        expect(computeClosing({ openingCents: 0,
inCents: 10000,
outCents: 0 }, 10500).differenceCents).toBe(500);
        expect(computeClosing({ openingCents: 0,
inCents: 10000,
outCents: 0 }, 9500).differenceCents).toBe(-500);
    });

    it('aceita saldo esperado negativo', () => {
        const r = computeClosing({ openingCents: 0,
inCents: 0,
outCents: 7500 }, -7500);
        expect(r.expectedBalanceCents).toBe(-7500);
        expect(r.differenceCents).toBe(0);
    });
});

describe('CreateFinanceClosingUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.findAccountById).mockResolvedValue({ id: ACC,
name: 'Banco' } as never);
        vi.mocked(repo.findClosing).mockResolvedValue(null);
        vi.mocked(repo.accountMonthMovement).mockResolvedValue({
            openingCents: 100000,
inCents: 50000,
outCents: 20000,
        } as never);
        vi.mocked(repo.createClosing).mockResolvedValue({ id: 'cl-1' } as never);
    });

    it('recalcula o esperado no servidor e ignora o que o cliente mandar', async () => {
        const uc = new CreateFinanceClosingUseCase(repo);
        const r = await uc.execute(
            { accountId: ACC,
month: '2026-09',
countedBalanceCents: 129000,
expectedBalanceCents: 999999 },
            'admin-1',
        );
        expect(r.error).toBeUndefined();
        const saved = vi.mocked(repo.createClosing).mock.calls[0][0];
        expect(saved.expectedBalanceCents).toBe(130000);
        expect(saved.differenceCents).toBe(-1000);
        expect(saved.closedByAdminId).toBe('admin-1');
    });

    it('recusa mês fora do formato AAAA-MM', async () => {
        const uc = new CreateFinanceClosingUseCase(repo);
        const r = await uc.execute({ accountId: ACC,
month: '09/2026',
countedBalanceCents: 0 }, null);
        expect(r.error?.message).toContain('Mês inválido');
    });

    it('recusa caixa inexistente', async () => {
        vi.mocked(repo.findAccountById).mockResolvedValue(null);
        const uc = new CreateFinanceClosingUseCase(repo);
        const r = await uc.execute({ accountId: ACC,
month: '2026-09',
countedBalanceCents: 0 }, null);
        expect(r.error?.message).toContain('Caixa inválido');
    });

    it('recusa fechar o mesmo mês duas vezes (409)', async () => {
        vi.mocked(repo.findClosing).mockResolvedValue({ id: 'cl-1' } as never);
        const uc = new CreateFinanceClosingUseCase(repo);
        const r = await uc.execute({ accountId: ACC,
month: '2026-09',
countedBalanceCents: 0 }, null);
        expect(r.error?.message).toContain('já está fechado');
        expect(repo.createClosing).not.toHaveBeenCalled();
    });

    it('usa o mês inteiro no cálculo', async () => {
        const uc = new CreateFinanceClosingUseCase(repo);
        await uc.execute({ accountId: ACC,
month: '2026-02',
countedBalanceCents: 130000 }, null);
        const [, from, to] = vi.mocked(repo.accountMonthMovement).mock.calls[0];
        expect(from.toISOString().slice(0, 10)).toBe('2026-02-01');
        expect(to.toISOString().slice(0, 10)).toBe('2026-02-28');
    });
});

describe('PreviewFinanceClosingUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.findAccountById).mockResolvedValue({ id: ACC } as never);
        vi.mocked(repo.accountMonthMovement).mockResolvedValue({
            openingCents: 5000,
inCents: 3000,
outCents: 1000,
        } as never);
    });

    it('sem fechamento ainda: diferença zero e saldo esperado calculado', async () => {
        vi.mocked(repo.findClosing).mockResolvedValue(null);
        const uc = new PreviewFinanceClosingUseCase(repo);
        const r = await uc.execute({ accountId: ACC,
month: '2026-09' });
        expect(r.preview?.expectedBalanceCents).toBe(7000);
        expect(r.preview?.differenceCents).toBe(0);
        expect(r.preview?.closing).toBeNull();
    });

    it('mês já fechado: usa o saldo contado guardado', async () => {
        vi.mocked(repo.findClosing).mockResolvedValue({ id: 'cl-1',
countedBalanceCents: 6500 } as never);
        const uc = new PreviewFinanceClosingUseCase(repo);
        const r = await uc.execute({ accountId: ACC,
month: '2026-09' });
        expect(r.preview?.differenceCents).toBe(-500);
        expect(r.preview?.closing).not.toBeNull();
    });
});

describe('DeleteFinanceClosingUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reabre o mês; 404 quando o fechamento não existe', async () => {
        vi.mocked(repo.deleteClosing).mockResolvedValue(true);
        const uc = new DeleteFinanceClosingUseCase(repo);
        expect((await uc.execute('cl-1')).error).toBeUndefined();

        vi.mocked(repo.deleteClosing).mockResolvedValue(false);
        expect((await uc.execute('cl-x')).error).toBeDefined();
    });
});
