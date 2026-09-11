import { z } from 'zod';
import type {
    FinanceRepository,
    FinancialTransactionModel,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';

export const financeTransactionSchema = z.object({
    type: z.enum(['IN', 'OUT']),
    amountCents: z.number().int().positive('O valor deve ser maior que zero'),
    date: z.coerce.date(),
    description: z.string().min(1, 'Informe a descrição'),
    method: z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()),
    notes: z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()),
    categoryId: z.preprocess(v => (v === '' ? null : v), z.string().uuid().nullable().optional()),
});

export class CreateFinanceTransactionUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(
        input: unknown,
        createdBy: string | null,
    ): Promise<{ error?: Error; transaction?: FinancialTransactionModel }> {
        const parsed = financeTransactionSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const data = parsed.data;

        // Categoria (se informada) precisa existir e bater com o tipo do lançamento.
        if (data.categoryId) {
            const cat = await this.repo.findCategoryById(data.categoryId);
            if (!cat) return { error: new ValidationError('Categoria inválida') };
            if (cat.type !== data.type) {
                return { error: new ValidationError('A categoria não corresponde ao tipo (entrada/saída) do lançamento') };
            }
        }

        const transaction = await this.repo.createTransaction({ ...data, createdBy });
        return { transaction };
    }
}
