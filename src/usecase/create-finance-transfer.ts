import { z } from 'zod';
import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';
import { closedMonthError } from './finance-closed-month.js';
import { financeDate } from './finance-dates.js';

export const financeTransferSchema = z.object({
    fromAccountId: z.string().uuid('Caixa de origem inválido'),
    toAccountId: z.string().uuid('Caixa de destino inválido'),
    amountCents: z.number().int().positive('O valor deve ser maior que zero'),
    date: financeDate,
    description: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
    method: z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()),
});

export class CreateFinanceTransferUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(input: unknown, createdBy: string | null): Promise<{ error?: Error }> {
        const parsed = financeTransferSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const data = parsed.data;
        if (data.fromAccountId === data.toAccountId) {
            return { error: new ValidationError('Origem e destino devem ser caixas diferentes') };
        }

        const [from, to] = await Promise.all([
            this.repo.findAccountById(data.fromAccountId),
            this.repo.findAccountById(data.toAccountId),
        ]);
        if (!from) return { error: new ValidationError('Caixa de origem inválido') };
        if (!to) return { error: new ValidationError('Caixa de destino inválido') };

        // Mês fechado em qualquer um dos dois caixas barra a transferência (SR-054).
        const locked = await closedMonthError(this.repo, [
            {
                accountId: data.fromAccountId,
                date: data.date,
            },
            {
                accountId: data.toAccountId,
                date: data.date,
            },
        ]);
        if (locked) return { error: locked };

        const description = data.description?.trim() || `Transferência: ${from.name} → ${to.name}`;

        await this.repo.createTransfer({
            fromAccountId: data.fromAccountId,
            toAccountId: data.toAccountId,
            amountCents: data.amountCents,
            date: data.date,
            description,
            method: data.method ?? null,
            createdBy,
        });
        return {};
    }
}
