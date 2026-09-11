import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { FinanceCategoryNotFoundError } from '../errors/not-found.js';

export class DeleteFinanceCategoryUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    // Soft-delete: lançamentos antigos mantêm a categoria (FK SET NULL não é
    // acionada; só some das listas). Preserva o histórico.
    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.repo.softDeleteCategory(id);
        if (!ok) return { error: new FinanceCategoryNotFoundError() };
        return {};
    }
}
