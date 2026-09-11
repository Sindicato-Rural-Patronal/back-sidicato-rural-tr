import type {
    FinanceRepository,
    FinancialAccountModel,
} from '../ports/external/finance-repository.js';

export class ListFinanceAccountsUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    execute(includeInactive: boolean): Promise<FinancialAccountModel[]> {
        return this.repo.listAccounts(includeInactive);
    }
}
