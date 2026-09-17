import { z } from 'zod';
import type {
    FinanceRepository,
    FinancialAccountModel,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';

export const financeAccountSchema = z.object({
    name: z.string().min(1, 'Informe o nome'),
    color: z.string().min(1).optional(),
    active: z.boolean().optional(),
    order: z.number().int().optional(),
});

export class CreateFinanceAccountUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(input: unknown): Promise<{
 error?: Error;
account?: FinancialAccountModel 
}> {
        const parsed = financeAccountSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const account = await this.repo.createAccount(parsed.data);
        return { account };
    }
}
