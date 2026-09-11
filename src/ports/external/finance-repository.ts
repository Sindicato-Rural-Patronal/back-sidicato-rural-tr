import type { FinancialCategoryModel } from '../../generated/prisma/models/FinancialCategory.js';
import type { FinancialTransactionModel } from '../../generated/prisma/models/FinancialTransaction.js';
import type { FinancialType } from '../../generated/prisma/enums.js';

export type { FinancialCategoryModel, FinancialTransactionModel, FinancialType };

export type FinanceCategoryCreateInput = {
    name: string;
    type: FinancialType;
    color?: string;
    active?: boolean;
    order?: number;
};

export type FinanceCategoryUpdateInput = Partial<FinanceCategoryCreateInput>;

export type FinanceTransactionCreateInput = {
    type: FinancialType;
    amountCents: number;
    date: Date;
    description: string;
    method?: string | null;
    notes?: string | null;
    categoryId?: string | null;
    createdBy?: string | null;
};

export type FinanceTransactionUpdateInput = Partial<
    Omit<FinanceTransactionCreateInput, 'createdBy'>
>;

// Lançamento já com a categoria embutida (para a listagem).
export type FinanceTransactionWithCategory = FinancialTransactionModel & {
    category: FinancialCategoryModel | null;
};

export type FinanceTransactionFilters = {
    from?: Date;
    to?: Date;
    type?: FinancialType;
    categoryId?: string;
    search?: string;
    skip: number;
    take: number;
};

// Resumo para o dashboard. Saldo é o acumulado histórico (caixa atual);
// os demais números respeitam o período (from..to).
export type FinanceSummary = {
    balanceAllTimeCents: number;
    periodInCents: number;
    periodOutCents: number;
    periodResultCents: number;
    byCategory: { categoryId: string | null; name: string; color: string; type: FinancialType; totalCents: number }[];
    byMonth: { month: string; inCents: number; outCents: number }[];
};

export interface FinanceRepository {
    // Categorias
    listCategories(includeInactive: boolean): Promise<FinancialCategoryModel[]>;
    findCategoryById(id: string): Promise<FinancialCategoryModel | null>;
    createCategory(data: FinanceCategoryCreateInput): Promise<FinancialCategoryModel>;
    updateCategory(id: string, data: FinanceCategoryUpdateInput): Promise<FinancialCategoryModel>;
    softDeleteCategory(id: string): Promise<boolean>;

    // Lançamentos
    listTransactions(
        filters: FinanceTransactionFilters,
    ): Promise<{ items: FinanceTransactionWithCategory[]; total: number }>;
    findTransactionById(id: string): Promise<FinancialTransactionModel | null>;
    createTransaction(data: FinanceTransactionCreateInput): Promise<FinancialTransactionModel>;
    updateTransaction(id: string, data: FinanceTransactionUpdateInput): Promise<FinancialTransactionModel>;
    softDeleteTransaction(id: string): Promise<boolean>;

    // Dashboard
    summary(from: Date, to: Date): Promise<FinanceSummary>;
}
