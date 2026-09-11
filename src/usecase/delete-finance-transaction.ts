import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { FinanceTransactionNotFoundError } from '../errors/not-found.js';

export class DeleteFinanceTransactionUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.repo.softDeleteTransaction(id);
        if (!ok) return { error: new FinanceTransactionNotFoundError() };
        return {};
    }
}
