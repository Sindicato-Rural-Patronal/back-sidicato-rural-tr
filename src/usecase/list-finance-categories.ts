import type {
    FinanceRepository,
    FinancialCategoryModel,
} from '../ports/external/finance-repository.js';

export class ListFinanceCategoriesUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    execute(includeInactive: boolean): Promise<FinancialCategoryModel[]> {
        return this.repo.listCategories(includeInactive);
    }
}
