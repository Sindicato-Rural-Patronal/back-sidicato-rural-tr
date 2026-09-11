import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';
import { NotFoundError } from '../errors/not-found.js';
import { financeAccountSchema } from './create-finance-account.js';

const updateSchema = financeAccountSchema.partial();

export class UpdateFinanceAccountUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const existing = await this.repo.findAccountById(id);
        if (!existing) return { error: new NotFoundError('Caixa não encontrado') };
        await this.repo.updateAccount(id, parsed.data);
        return {};
    }
}
