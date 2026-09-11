import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';
import { FinanceCategoryNotFoundError } from '../errors/not-found.js';
import { financeCategorySchema } from './create-finance-category.js';

const updateSchema = financeCategorySchema.partial();

export class UpdateFinanceCategoryUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const existing = await this.repo.findCategoryById(id);
        if (!existing) return { error: new FinanceCategoryNotFoundError() };
        await this.repo.updateCategory(id, parsed.data);
        return {};
    }
}
