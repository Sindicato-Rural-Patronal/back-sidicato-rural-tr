import type {
    FinanceRepository,
    FinanceTransactionUpdateInput,
    FinancialTransactionModel,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';
import { FinanceTransactionNotFoundError } from '../errors/not-found.js';
import { FinanceNumberInUseError } from '../errors/conflict.js';
import { financeTransactionSchema } from './create-finance-transaction.js';
import { closedMonthError } from './finance-closed-month.js';

const updateSchema = financeTransactionSchema.partial();

export class UpdateFinanceTransactionUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(
        id: string,
        input: unknown,
    ): Promise<{
        error?: Error;
        /** O lançamento como ficou (com o `number`). */
        transaction?: FinancialTransactionModel;
    }> {
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

        // Mês fechado (SR-054): nem editar o lançamento que está nele, nem mover
        // um lançamento para dentro dele (pela data ou pelo caixa).
        const locked = await closedMonthError(this.repo, [
            {
                accountId: existing.accountId,
                date: existing.date,
            },
            {
                accountId: data.accountId !== undefined ? data.accountId : existing.accountId,
                date: data.date ?? existing.date,
            },
        ]);
        if (locked) return { error: locked };

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

        // Trocar o Nº confere, dentro da trava, que ninguém mais o usa (nem excluído).
        const written = await this.repo.updateTransaction(id, data);
        if ('conflict' in written) {
            return { error: new FinanceNumberInUseError(written.conflict.number, written.conflict.deleted) };
        }
        return { transaction: written.result };
    }
}
