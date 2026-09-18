import type { FinancialCategoryModel } from '../../generated/prisma/models/FinancialCategory.js';
import type { FinancialTransactionModel } from '../../generated/prisma/models/FinancialTransaction.js';
import type { FinancialAccountModel } from '../../generated/prisma/models/FinancialAccount.js';
import type { FinanceRecurringTransactionModel } from '../../generated/prisma/models/FinanceRecurringTransaction.js';
import type { FinancePaymentMethodModel } from '../../generated/prisma/models/FinancePaymentMethod.js';
import type { FinanceMonthlyClosingModel } from '../../generated/prisma/models/FinanceMonthlyClosing.js';
import type { FinancialType } from '../../generated/prisma/enums.js';

export type {
    FinancialCategoryModel,
    FinancialTransactionModel,
    FinancialAccountModel,
    FinanceRecurringTransactionModel,
    FinancePaymentMethodModel,
    FinanceMonthlyClosingModel,
    FinancialType,
};

export type FinanceCategoryCreateInput = {
    name: string;
    type: FinancialType;
    color?: string;
    active?: boolean;
    order?: number;
};

export type FinanceCategoryUpdateInput = Partial<FinanceCategoryCreateInput>;

export type FinanceAccountCreateInput = {
    name: string;
    color?: string;
    active?: boolean;
    order?: number;
};

export type FinanceAccountUpdateInput = Partial<FinanceAccountCreateInput>;

// Dados da Nota de Empenho (fornecedor, NF, banco, desconto) — todos opcionais.
export type FinanceEmpenho = {
    numero?: string;
    notaFiscal?: string;
    nomeFantasia?: string;
    razaoSocial?: string;
    cnpjCpf?: string;
    inscricaoEstadual?: string;
    endereco?: string;
    bairro?: string;
    cep?: string;
    cidade?: string;
    uf?: string;
    telefone?: string;
    descontoCents?: number;
    banco?: string;
    conta?: string;
    agencia?: string;
    cheque?: string;
    usuarioId?: string;
};

export type FinanceTransactionCreateInput = {
    // null = "só nota" (sem lançamento no caixa; fora de saldo/KPIs).
    type: FinancialType | null;
    amountCents: number;
    date: Date;
    description: string;
    method?: string | null;
    notes?: string | null;
    categoryId?: string | null;
    accountId?: string | null;
    empenho?: FinanceEmpenho | null;
    createdBy?: string | null;
};

export type FinanceTransactionUpdateInput = Partial<
    Omit<FinanceTransactionCreateInput, 'createdBy'>
>;

export type FinanceTransferInput = {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    date: Date;
    description: string;
    method?: string | null;
    createdBy?: string | null;
};

// Metadados de um comprovante — nunca os bytes (`data`) na listagem.
export type FinanceAttachmentMeta = {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    createdAt: Date;
};

// Comprovante com os bytes, para download.
export type FinanceAttachmentFile = {
 data: Buffer;
filename: string;
mimeType: string 
};

// Lançamento já com categoria, conta e comprovantes (só metadados) embutidos.
export type FinanceTransactionWithCategory = FinancialTransactionModel & {
    category: FinancialCategoryModel | null;
    account: FinancialAccountModel | null;
    attachments: FinanceAttachmentMeta[];
};

export type FinanceTransactionFilters = {
    from?: Date;
    to?: Date;
    type?: FinancialType;
    categoryId?: string;
    accountId?: string;
    /** Forma de pagamento (texto do lançamento; comparado sem diferenciar maiúsculas). */
    method?: string;
    search?: string;
    skip: number;
    take: number;
};

// Soma dos valores por tipo, com as transferências entre caixas separadas —
// base dos totais (entradas/saídas) da lista de lançamentos.
export type FinanceTransactionSum = {
    type: FinancialType | null;
    transfer: boolean;
    amountCents: number;
};

// Resumo para o dashboard. Saldo é o acumulado histórico (caixa atual);
// os demais números respeitam o período (from..to).
export type FinanceSummary = {
    balanceAllTimeCents: number;
    periodInCents: number;
    periodOutCents: number;
    periodResultCents: number;
    byCategory: {
 categoryId: string | null;
name: string;
color: string;
type: FinancialType;
totalCents: number 
}[];
    byMonth: {
 month: string;
inCents: number;
outCents: number 
}[];
    // Saldo acumulado (todas as datas) por conta/caixa.
    byAccount: {
 accountId: string | null;
name: string;
color: string;
balanceCents: number 
}[];
};

// ── Recorrentes (item 50) ───────────────────────────────────────────────────
// Meses são texto "YYYY-MM" (comparável e ordenável como string, sem fuso).
export type FinanceRecurrenceCreateInput = {
    type: FinancialType;
    description: string;
    amountCents: number;
    dayOfMonth: number;
    startMonth: string;
    endMonth?: string | null;
    paymentMethod?: string | null;
    notes?: string | null;
    categoryId?: string | null;
    accountId?: string | null;
    active?: boolean;
};

export type FinanceRecurrenceUpdateInput = Partial<FinanceRecurrenceCreateInput>;

// Recorrência com categoria e caixa embutidos (listagem do painel).
export type FinanceRecurrenceWithRefs = FinanceRecurringTransactionModel & {
    category: FinancialCategoryModel | null;
    account: FinancialAccountModel | null;
};

// Lançamento a criar a partir de uma recorrência, em um mês específico.
export type FinanceRecurrenceRun = {
    recurringId: string;
    recurringMonth: string;
    date: Date;
    type: FinancialType;
    amountCents: number;
    description: string;
    method?: string | null;
    notes?: string | null;
    categoryId?: string | null;
    accountId?: string | null;
};

// ── Formas de pagamento (item 51) ───────────────────────────────────────────
export type FinancePaymentMethodCreateInput = {
    name: string;
    active?: boolean;
    order?: number;
};

export type FinancePaymentMethodUpdateInput = Partial<FinancePaymentMethodCreateInput>;

// ── Fechamento mensal (item 52) ─────────────────────────────────────────────
// Movimento de um caixa em um mês, com o saldo de abertura (tudo antes do mês).
export type FinanceAccountMonthMovement = {
    openingCents: number;
    inCents: number;
    outCents: number;
};

export type FinanceClosingCreateInput = {
    accountId: string;
    month: string;
    expectedBalanceCents: number;
    countedBalanceCents: number;
    differenceCents: number;
    notes?: string | null;
    closedByAdminId?: string | null;
};

export interface FinanceRepository {
    // Categorias
    listCategories(includeInactive: boolean): Promise<FinancialCategoryModel[]>;
    findCategoryById(id: string): Promise<FinancialCategoryModel | null>;
    createCategory(data: FinanceCategoryCreateInput): Promise<FinancialCategoryModel>;
    updateCategory(id: string, data: FinanceCategoryUpdateInput): Promise<FinancialCategoryModel>;
    softDeleteCategory(id: string): Promise<boolean>;

    // Contas / caixas
    listAccounts(includeInactive: boolean): Promise<FinancialAccountModel[]>;
    findAccountById(id: string): Promise<FinancialAccountModel | null>;
    createAccount(data: FinanceAccountCreateInput): Promise<FinancialAccountModel>;
    updateAccount(id: string, data: FinanceAccountUpdateInput): Promise<FinancialAccountModel>;
    softDeleteAccount(id: string): Promise<boolean>;

    // Lançamentos
    listTransactions(
        filters: FinanceTransactionFilters,
    ): Promise<{
 items: FinanceTransactionWithCategory[];
total: number 
}>;
    // Todos os lançamentos que batem com os filtros (sem paginação) — export.
    listTransactionsForExport(
        filters: Omit<FinanceTransactionFilters, 'skip' | 'take'>,
    ): Promise<FinanceTransactionWithCategory[]>;
    // Somas de todos os lançamentos que batem com os filtros (mesmo where da lista).
    sumTransactions(
        filters: Omit<FinanceTransactionFilters, 'skip' | 'take'>,
    ): Promise<FinanceTransactionSum[]>;
    findTransactionById(id: string): Promise<FinancialTransactionModel | null>;
    createTransaction(data: FinanceTransactionCreateInput): Promise<FinancialTransactionModel>;
    updateTransaction(id: string, data: FinanceTransactionUpdateInput): Promise<FinancialTransactionModel>;
    softDeleteTransaction(id: string): Promise<boolean>;

    // Transferência entre caixas: cria os 2 lançamentos ligados (OUT + IN).
    createTransfer(input: FinanceTransferInput): Promise<void>;
    // Soft-delete dos 2 lançamentos de uma transferência.
    softDeleteTransfer(transferId: string): Promise<boolean>;

    // Comprovantes (anexos)
    addAttachment(
        transactionId: string,
        data: Buffer,
        filename: string,
        mimeType: string,
        size: number,
    ): Promise<FinanceAttachmentMeta>;
    getAttachment(id: string): Promise<FinanceAttachmentFile | null>;
    deleteAttachment(id: string): Promise<boolean>;

    // Recorrentes
    listRecurrences(includeInactive: boolean): Promise<FinanceRecurrenceWithRefs[]>;
    // Só as ativas (e não excluídas) — base da geração automática.
    listRecurrencesToGenerate(): Promise<FinanceRecurringTransactionModel[]>;
    findRecurrenceById(id: string): Promise<FinanceRecurringTransactionModel | null>;
    createRecurrence(data: FinanceRecurrenceCreateInput): Promise<FinanceRecurringTransactionModel>;
    updateRecurrence(id: string, data: FinanceRecurrenceUpdateInput): Promise<FinanceRecurringTransactionModel>;
    // Soft-delete: os lançamentos já gerados continuam no caixa.
    softDeleteRecurrence(id: string): Promise<boolean>;
    // Cria o lançamento do mês; `false` quando ele já existia (unique) — idempotente.
    createRecurrenceTransaction(run: FinanceRecurrenceRun): Promise<boolean>;
    setRecurrenceLastGeneratedMonth(id: string, month: string): Promise<void>;

    // Formas de pagamento
    listPaymentMethods(includeInactive: boolean): Promise<FinancePaymentMethodModel[]>;
    findPaymentMethodByName(name: string): Promise<FinancePaymentMethodModel | null>;
    createPaymentMethod(data: FinancePaymentMethodCreateInput): Promise<FinancePaymentMethodModel>;
    updatePaymentMethod(id: string, data: FinancePaymentMethodUpdateInput): Promise<FinancePaymentMethodModel>;
    softDeletePaymentMethod(id: string): Promise<boolean>;

    // Fechamento mensal
    listClosings(filters: {
 accountId?: string;
year?: string 
}): Promise<FinanceMonthlyClosingModel[]>;
    findClosing(accountId: string, month: string): Promise<FinanceMonthlyClosingModel | null>;
    // Saldo de abertura + entradas/saídas do caixa no mês [from, to].
    accountMonthMovement(accountId: string, from: Date, to: Date): Promise<FinanceAccountMonthMovement>;
    createClosing(data: FinanceClosingCreateInput): Promise<FinanceMonthlyClosingModel>;
    deleteClosing(id: string): Promise<boolean>;

    // Dashboard
    summary(from: Date, to: Date): Promise<FinanceSummary>;
}
