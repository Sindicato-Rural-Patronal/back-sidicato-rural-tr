import { z } from 'zod';
import type {
    FinanceRepository,
    FinanceRecurrenceWithRefs,
    FinanceRecurringTransactionModel,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';
import { NotFoundError } from '../errors/not-found.js';

// ── Meses ("YYYY-MM") ───────────────────────────────────────────────────────
// Mês é texto: comparável e ordenável como string, e sem surpresa de fuso.
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(value: string): boolean {
    return MONTH_RE.test(value);
}

/** Mês (no fuso local do servidor) de uma data — "hoje" da geração. */
export function monthOf(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Soma `n` meses a "YYYY-MM". */
export function addMonths(month: string, n: number): string {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + n;
    return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Último dia do mês (28–31). */
export function lastDayOfMonth(month: string): number {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Data do lançamento do mês. Mês mais curto que o `dayOfMonth` escolhido usa o
 * último dia dele (dia 31 em fevereiro → 28/29).
 * Meia-noite UTC, como as datas que chegam do painel ("YYYY-MM-DD").
 */
export function dateForMonth(month: string, dayOfMonth: number): Date {
    const [y, m] = month.split('-').map(Number);
    const day = Math.min(dayOfMonth, lastDayOfMonth(month));
    return new Date(Date.UTC(y, m - 1, day));
}

/** Teto de segurança: uma recorrência antiga nunca gera mais que 10 anos de uma vez. */
export const MAX_MONTHS_PER_RUN = 120;

/**
 * Meses que ainda faltam gerar, do mais antigo ao mais novo.
 * Começa no mês seguinte ao último gerado (ou no `startMonth`, se nunca gerou) e
 * vai até o mês atual — respeitando o `endMonth`, quando houver.
 */
export function monthsToGenerate(
    rec: {
        startMonth: string;
        endMonth?: string | null;
        lastGeneratedMonth?: string | null;
    },
    currentMonth: string,
): string[] {
    const first = rec.lastGeneratedMonth
        ? // Já gerou algo: retoma do mês seguinte (nunca antes do início).
          maxMonth(addMonths(rec.lastGeneratedMonth, 1), rec.startMonth)
        : rec.startMonth;
    const last = rec.endMonth ? minMonth(currentMonth, rec.endMonth) : currentMonth;
    const months: string[] = [];
    for (let m = first; m <= last && months.length < MAX_MONTHS_PER_RUN; m = addMonths(m, 1)) {
        months.push(m);
    }
    return months;
}

function maxMonth(a: string, b: string): string {
    return a >= b ? a : b;
}

function minMonth(a: string, b: string): string {
    return a <= b ? a : b;
}

// ── Schemas ─────────────────────────────────────────────────────────────────
const monthField = z.string().regex(MONTH_RE, 'Mês inválido (use AAAA-MM)');

export const financeRecurrenceSchema = z.object({
    type: z.enum(['IN', 'OUT']),
    description: z.string().min(1, 'Informe a descrição'),
    amountCents: z.number().int().positive('O valor deve ser maior que zero'),
    dayOfMonth: z.number().int().min(1, 'O dia deve ser entre 1 e 31').max(31, 'O dia deve ser entre 1 e 31'),
    startMonth: monthField,
    endMonth: z.preprocess(v => (v === '' ? null : v), monthField.nullable().optional()),
    paymentMethod: z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()),
    notes: z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()),
    categoryId: z.preprocess(v => (v === '' ? null : v), z.string().uuid().nullable().optional()),
    accountId: z.preprocess(v => (v === '' ? null : v), z.string().uuid().nullable().optional()),
    active: z.boolean().optional(),
});

const updateSchema = financeRecurrenceSchema.partial();

// ── Use cases ───────────────────────────────────────────────────────────────
export class ListFinanceRecurrencesUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    execute(includeInactive: boolean): Promise<FinanceRecurrenceWithRefs[]> {
        return this.repo.listRecurrences(includeInactive);
    }
}

/** Categoria precisa existir e bater com o tipo; caixa precisa existir. */
async function validateRefs(
    repo: FinanceRepository,
    data: {
 type?: 'IN' | 'OUT';
categoryId?: string | null;
accountId?: string | null 
},
    currentType?: 'IN' | 'OUT',
): Promise<Error | undefined> {
    if (data.categoryId) {
        const cat = await repo.findCategoryById(data.categoryId);
        if (!cat) return new ValidationError('Categoria inválida');
        const type = data.type ?? currentType;
        if (type && cat.type !== type) {
            return new ValidationError('A categoria não corresponde ao tipo (entrada/saída) da recorrência');
        }
    }
    if (data.accountId) {
        const acc = await repo.findAccountById(data.accountId);
        if (!acc) return new ValidationError('Caixa inválido');
    }
    return undefined;
}

export class CreateFinanceRecurrenceUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(input: unknown): Promise<{
 error?: Error;
recurrence?: FinanceRecurringTransactionModel
}> {
        const parsed = financeRecurrenceSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const data = parsed.data;
        if (data.endMonth && data.endMonth < data.startMonth) {
            return { error: new ValidationError('O mês final não pode ser antes do inicial') };
        }
        const refError = await validateRefs(this.repo, data);
        if (refError) return { error: refError };

        const recurrence = await this.repo.createRecurrence(data);
        return { recurrence };
    }
}

export class UpdateFinanceRecurrenceUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const current = await this.repo.findRecurrenceById(id);
        if (!current) return { error: new NotFoundError('Recorrência não encontrada') };

        const data = parsed.data;
        const startMonth = data.startMonth ?? current.startMonth;
        const endMonth = data.endMonth === undefined ? current.endMonth : data.endMonth;
        if (endMonth && endMonth < startMonth) {
            return { error: new ValidationError('O mês final não pode ser antes do inicial') };
        }
        const refError = await validateRefs(this.repo, data, current.type);
        if (refError) return { error: refError };

        await this.repo.updateRecurrence(id, data);
        return {};
    }
}

export class DeleteFinanceRecurrenceUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    // Apaga só o molde — os lançamentos já gerados continuam no caixa.
    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.repo.softDeleteRecurrence(id);
        if (!ok) return { error: new NotFoundError('Recorrência não encontrada') };
        return {};
    }
}

/**
 * Gera os lançamentos que faltam de todas as recorrências ativas, até o mês
 * atual. Idempotente: além do `lastGeneratedMonth`, o unique
 * (recurringId, recurringMonth) no banco impede o mesmo mês duas vezes.
 */
export class GenerateFinanceRecurrencesUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(now: Date = new Date()): Promise<{ created: number }> {
        const currentMonth = monthOf(now);
        const recurrences = await this.repo.listRecurrencesToGenerate();
        let created = 0;

        for (const rec of recurrences) {
            const months = monthsToGenerate(rec, currentMonth);
            if (months.length === 0) continue;

            for (const month of months) {
                const didCreate = await this.repo.createRecurrenceTransaction({
                    recurringId: rec.id,
                    recurringMonth: month,
                    date: dateForMonth(month, rec.dayOfMonth),
                    type: rec.type,
                    amountCents: rec.amountCents,
                    description: rec.description,
                    method: rec.paymentMethod,
                    notes: rec.notes,
                    categoryId: rec.categoryId,
                    accountId: rec.accountId,
                });
                if (didCreate) created += 1;
            }
            // Marca o último mês percorrido mesmo quando nada foi criado (já existia):
            // a próxima passada não refaz o caminho todo.
            await this.repo.setRecurrenceLastGeneratedMonth(rec.id, months[months.length - 1]);
        }

        return { created };
    }
}
