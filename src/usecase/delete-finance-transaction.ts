import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { FinanceTransactionNotFoundError } from '../errors/not-found.js';

export class DeleteFinanceTransactionUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const tx = await this.repo.findTransactionById(id);
        if (!tx) return { error: new FinanceTransactionNotFoundError() };
        // Transferência: apaga os dois lançamentos ligados.
        if (tx.transferId) {
            await this.repo.softDeleteTransfer(tx.transferId);
            return {};
        }
        const ok = await this.repo.softDeleteTransaction(id);
        if (!ok) return { error: new FinanceTransactionNotFoundError() };
        return {};
    }
}
