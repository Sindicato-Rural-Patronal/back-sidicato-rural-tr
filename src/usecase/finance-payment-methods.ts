import { z } from 'zod';
import type {
    FinanceRepository,
    FinancePaymentMethodModel,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';
import { NotFoundError } from '../errors/not-found.js';
import { ConflictError } from '../errors/conflict.js';

/**
 * Nome da forma de pagamento normalizado: sem espaços nas pontas e em caixa
 * alta. Assim "pix", "Pix" e "PIX " viram a mesma coisa e a lista não repete.
 */
export function normalizePaymentMethodName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

export const financePaymentMethodSchema = z.object({
    name: z.string().min(1, 'Informe o nome'),
    active: z.boolean().optional(),
    order: z.number().int().optional(),
});

const updateSchema = financePaymentMethodSchema.partial();

export class ListFinancePaymentMethodsUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    execute(includeInactive: boolean): Promise<FinancePaymentMethodModel[]> {
        return this.repo.listPaymentMethods(includeInactive);
    }
}

export class CreateFinancePaymentMethodUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(input: unknown): Promise<{
 error?: Error;
method?: FinancePaymentMethodModel
}> {
        const parsed = financePaymentMethodSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const name = normalizePaymentMethodName(parsed.data.name);
        if (!name) return { error: new ValidationError('Informe o nome') };

        const existing = await this.repo.findPaymentMethodByName(name);
        if (existing) {
            // Já existia e foi desativada/excluída: reaproveita em vez de duplicar.
            if (existing.isDeleted || !existing.active) {
                const method = await this.repo.updatePaymentMethod(existing.id, { active: true });
                return { method };
            }
            return { error: new ConflictError('Já existe uma forma de pagamento com esse nome') };
        }

        const method = await this.repo.createPaymentMethod({ ...parsed.data,
name });
        return { method };
    }
}

export class UpdateFinancePaymentMethodUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const data = { ...parsed.data };
        if (data.name !== undefined) {
            const name = normalizePaymentMethodName(data.name);
            if (!name) return { error: new ValidationError('Informe o nome') };
            const existing = await this.repo.findPaymentMethodByName(name);
            if (existing && existing.id !== id) {
                return { error: new ConflictError('Já existe uma forma de pagamento com esse nome') };
            }
            data.name = name;
        }
        try {
            await this.repo.updatePaymentMethod(id, data);
        } catch {
            return { error: new NotFoundError('Forma de pagamento não encontrada') };
        }
        return {};
    }
}

export class DeleteFinancePaymentMethodUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    // Soft-delete: os lançamentos antigos guardam o texto e não são tocados.
    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.repo.softDeletePaymentMethod(id);
        if (!ok) return { error: new NotFoundError('Forma de pagamento não encontrada') };
        return {};
    }
}
