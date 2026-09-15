import type {
    FinanceRepository,
    FinanceTransactionUpdateInput,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';
import { FinanceTransactionNotFoundError } from '../errors/not-found.js';
import { financeTransactionSchema } from './create-finance-transaction.js';

const updateSchema = financeTransactionSchema.partial();

export class UpdateFinanceTransactionUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const existing = await this.repo.findTransactionById(id);
        if (!existing) return { error: new FinanceTransactionNotFoundError() };
        if (existing.transferId) {
            return { error: new ValidationError('Transferências não podem ser editadas — exclua e refaça.') };
        }

        const data = parsed.data as FinanceTransactionUpdateInput;
        // Tipo efetivo após a edição. `undefined` = não mexeu; `null` = virou "só
        // nota" (sem lançamento). Por isso não uso `??` (trataria null como ausente).
        const typeProvided = data.type !== undefined;
        const effectiveType = typeProvided ? data.type : existing.type;

        if (data.categoryId) {
            if (!effectiveType) {
                return { error: new ValidationError('Defina o tipo (entrada/saída) para vincular uma categoria.') };
            }
            const cat = await this.repo.findCategoryById(data.categoryId);
            if (!cat) return { error: new ValidationError('Categoria inválida') };
            if (cat.type !== effectiveType) {
                return { error: new ValidationError('A categoria não corresponde ao tipo (entrada/saída) do lançamento') };
            }
        } else if (typeProvided && data.type !== existing.type && existing.categoryId) {
            // Trocou o tipo sem reenviar categoria.
            if (!effectiveType) {
                // Virou "só nota" → a categoria não faz mais sentido; limpa.
                data.categoryId = null;
            } else {
                // Revalida a categoria atual contra o novo tipo.
                const cat = await this.repo.findCategoryById(existing.categoryId);
                if (cat && cat.type !== effectiveType) {
                    return { error: new ValidationError('A categoria atual não corresponde ao novo tipo — selecione uma categoria compatível.') };
                }
            }
        }

        if (data.accountId) {
            const acc = await this.repo.findAccountById(data.accountId);
            if (!acc) return { error: new ValidationError('Caixa inválido') };
        }

        await this.repo.updateTransaction(id, data);
        return {};
    }
}
