import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { FinanceTransactionNotFoundError } from '../errors/not-found.js';
import { closedMonthError } from './finance-closed-month.js';

export class DeleteFinanceTransactionUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const tx = await this.repo.findTransactionById(id);
        if (!tx) return { error: new FinanceTransactionNotFoundError() };

        // Mês fechado (SR-054). Numa transferência, as duas pernas: se uma delas
        // está num mês fechado, nenhuma sai.
        const legs = tx.transferId ? await this.repo.listTransferLegs(tx.transferId) : [tx];
        const locked = await closedMonthError(
            this.repo,
            legs.map(leg => ({
                accountId: leg.accountId,
                date: leg.date,
            })),
        );
        if (locked) return { error: locked };

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
