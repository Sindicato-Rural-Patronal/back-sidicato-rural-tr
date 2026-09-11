import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { NotFoundError } from '../errors/not-found.js';

export class DeleteFinanceAccountUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    // Soft-delete: lançamentos antigos mantêm o accountId (FK SET NULL não é
    // acionada; só some das listas). Preserva o histórico.
    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.repo.softDeleteAccount(id);
        if (!ok) return { error: new NotFoundError('Caixa não encontrado') };
        return {};
    }
}
