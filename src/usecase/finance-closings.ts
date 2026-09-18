import { z } from 'zod';
import type {
    FinanceRepository,
    FinanceMonthlyClosingModel,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';
import { NotFoundError } from '../errors/not-found.js';
import { ConflictError } from '../errors/conflict.js';
import { isMonth } from './finance-recurrences.js';

/** Primeiro instante do mês "YYYY-MM" e o último (23:59:59.999 do último dia). */
export function monthRange(month: string): {
 from: Date;
to: Date 
} {
    const [y, m] = month.split('-').map(Number);
    return {
        from: new Date(Date.UTC(y, m - 1, 1)),
        to: new Date(Date.UTC(y, m, 1) - 1),
    };
}

export type FinanceClosingCalc = {
    openingCents: number;
    inCents: number;
    outCents: number;
    expectedBalanceCents: number;
    differenceCents: number;
};

/**
 * Saldo esperado do caixa no fim do mês = abertura + entradas − saídas.
 * Diferença = contado − esperado (positivo sobrou, negativo faltou).
 */
export function computeClosing(
    movement: {
 openingCents: number;
inCents: number;
outCents: number 
},
    countedBalanceCents: number,
): FinanceClosingCalc {
    const expectedBalanceCents = movement.openingCents + movement.inCents - movement.outCents;
    return {
        ...movement,
        expectedBalanceCents,
        differenceCents: countedBalanceCents - expectedBalanceCents,
    };
}

const listSchema = z.object({
    accountId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    year: z.preprocess(
        v => (v === '' || v == null ? undefined : String(v)),
        z.string().regex(/^\d{4}$/, 'Ano inválido').optional(),
    ),
});

const createSchema = z.object({
    accountId: z.string().uuid('Escolha o caixa'),
    month: z.string().refine(isMonth, 'Mês inválido (use AAAA-MM)'),
    countedBalanceCents: z.number().int(),
    notes: z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()),
});

export class ListFinanceClosingsUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(query: unknown): Promise<FinanceMonthlyClosingModel[]> {
        const q = listSchema.parse(query ?? {});
        return this.repo.listClosings({ accountId: q.accountId,
year: q.year });
    }
}

/**
 * Prévia do fechamento: o que o sistema calculou para o mês/caixa, sem gravar.
 * É o que a tela mostra antes de o usuário digitar o saldo contado.
 */
export class PreviewFinanceClosingUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(
        query: unknown,
    ): Promise<{
 error?: Error;
preview?: FinanceClosingCalc & { closing: FinanceMonthlyClosingModel | null }
}> {
        const parsed = z
            .object({ accountId: z.string().uuid('Escolha o caixa'),
month: z.string().refine(isMonth, 'Mês inválido (use AAAA-MM)') })
            .safeParse(query ?? {});
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const { accountId, month } = parsed.data;
        const account = await this.repo.findAccountById(accountId);
        if (!account) return { error: new ValidationError('Caixa inválido') };

        const { from, to } = monthRange(month);
        const movement = await this.repo.accountMonthMovement(accountId, from, to);
        const closing = await this.repo.findClosing(accountId, month);
        // Sem saldo contado ainda: a prévia usa o esperado (diferença zero).
        const counted = closing?.countedBalanceCents
            ?? movement.openingCents + movement.inCents - movement.outCents;
        return { preview: { ...computeClosing(movement, counted),
closing } };
    }
}

export class CreateFinanceClosingUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(
        input: unknown,
        closedByAdminId: string | null,
    ): Promise<{
 error?: Error;
closing?: FinanceMonthlyClosingModel
}> {
        const parsed = createSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const { accountId, month, countedBalanceCents, notes } = parsed.data;

        const account = await this.repo.findAccountById(accountId);
        if (!account) return { error: new ValidationError('Caixa inválido') };

        const already = await this.repo.findClosing(accountId, month);
        if (already) return { error: new ConflictError('Este mês já está fechado para esse caixa') };

        // O esperado é sempre recalculado aqui — nunca vem do navegador.
        const { from, to } = monthRange(month);
        const movement = await this.repo.accountMonthMovement(accountId, from, to);
        const calc = computeClosing(movement, countedBalanceCents);

        const closing = await this.repo.createClosing({
            accountId,
            month,
            expectedBalanceCents: calc.expectedBalanceCents,
            countedBalanceCents,
            differenceCents: calc.differenceCents,
            notes: notes ?? null,
            closedByAdminId,
        });
        return { closing };
    }
}

/** Reabrir o mês: apaga o fechamento (os lançamentos não são tocados). */
export class DeleteFinanceClosingUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.repo.deleteClosing(id);
        if (!ok) return { error: new NotFoundError('Fechamento não encontrado') };
        return {};
    }
}
