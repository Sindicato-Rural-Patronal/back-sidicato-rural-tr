import { z } from 'zod';
import type {
    FinanceRepository,
    FinancialTransactionModel,
} from '../ports/external/finance-repository.js';
import { ValidationError } from '../errors/validation.js';

export const financeTransactionSchema = z.object({
    // null/ausente = "só nota" (sem lançamento no caixa): não entra em saldo/KPIs.
    type: z.preprocess(v => (v === '' ? null : v), z.enum(['IN', 'OUT']).nullable().optional()),
    amountCents: z.number().int().positive('O valor deve ser maior que zero'),
    date: z.coerce.date(),
    description: z.string().min(1, 'Informe a descrição'),
    method: z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()),
    notes: z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()),
    categoryId: z.preprocess(v => (v === '' ? null : v), z.string().uuid().nullable().optional()),
    accountId: z.preprocess(v => (v === '' ? null : v), z.string().uuid().nullable().optional()),
    empenho: z.object({
        numero: z.string().optional(),
        notaFiscal: z.string().optional(),
        nomeFantasia: z.string().optional(),
        razaoSocial: z.string().optional(),
        cnpjCpf: z.string().optional(),
        inscricaoEstadual: z.string().optional(),
        endereco: z.string().optional(),
        bairro: z.string().optional(),
        cep: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
        telefone: z.string().optional(),
        descontoCents: z.number().int().min(0).optional(),
        banco: z.string().optional(),
        conta: z.string().optional(),
        agencia: z.string().optional(),
        cheque: z.string().optional(),
        // Vínculo opcional com um cadastro (origem dos dados do fornecedor). Os
        // campos acima permanecem como snapshot da emissão.
        //
        // `usuarioId` é pessoa e `empresaId` é empresa. Antes da separação de
        // pessoas e empresas (set/2026) a empresa era um UserData com CNPJ, e
        // só `usuarioId` dava conta; desde então fornecedor pessoa jurídica
        // ficou sem como ser vinculado. Os dois campos existem porque um
        // fornecedor é uma coisa OU a outra.
        usuarioId: z.string().uuid().optional(),
        empresaId: z.string().uuid().optional(),
    }).nullable().optional(),
});

export class CreateFinanceTransactionUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(
        input: unknown,
        createdBy: string | null,
    ): Promise<{
 error?: Error;
transaction?: FinancialTransactionModel 
}> {
        const parsed = financeTransactionSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const data = parsed.data;

        // Categoria (se informada) precisa existir e bater com o tipo do lançamento.
        // Sem tipo (só nota) não pode ter categoria.
        if (data.categoryId) {
            if (!data.type) {
                return { error: new ValidationError('Defina o tipo (entrada/saída) para vincular uma categoria.') };
            }
            const cat = await this.repo.findCategoryById(data.categoryId);
            if (!cat) return { error: new ValidationError('Categoria inválida') };
            if (cat.type !== data.type) {
                return { error: new ValidationError('A categoria não corresponde ao tipo (entrada/saída) do lançamento') };
            }
        }

        // Caixa (se informado) precisa existir.
        if (data.accountId) {
            const acc = await this.repo.findAccountById(data.accountId);
            if (!acc) return { error: new ValidationError('Caixa inválido') };
        }

        const transaction = await this.repo.createTransaction({ ...data,
type: data.type ?? null,
createdBy });
        return { transaction };
    }
}
