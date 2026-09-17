import { z } from 'zod';
import type {
    FinanceRepository,
    FinancialCategoryModel,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';

export const financeCategorySchema = z.object({
    name: z.string().min(1, 'Informe o nome'),
    type: z.enum(['IN', 'OUT']),
    color: z.string().min(1).optional(),
    active: z.boolean().optional(),
    order: z.number().int().optional(),
});

export class CreateFinanceCategoryUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(input: unknown): Promise<{
 error?: Error;
category?: FinancialCategoryModel 
}> {
        const parsed = financeCategorySchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const category = await this.repo.createCategory(parsed.data);
        return { category };
    }
}
