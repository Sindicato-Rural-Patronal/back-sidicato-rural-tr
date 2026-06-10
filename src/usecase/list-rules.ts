import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { RuleModel } from '../generated/prisma/models/Rule.js';

type PagedResult<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
type ListRulesResponse = {
    error?: Error;
    result?: PagedResult<RuleModel>;
};

export class ListRulesUseCase {
    constructor(private ruleRepository: RuleRepository) {}

    async execute(page = 1, limit = 20): Promise<ListRulesResponse> {
        const skip = (page - 1) * limit;
        const [rules, total] = await Promise.all([
            this.ruleRepository.findAll(skip, limit),
            this.ruleRepository.count(),
        ]);
        console.log(`[ListRules] page=${page} limit=${limit} total=${total}`);
        return {
            result: { data: rules,
total,
page,
limit,
totalPages: Math.ceil(total / limit) },
        };
    }
}
