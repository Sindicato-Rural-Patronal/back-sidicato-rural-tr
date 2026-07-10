import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { RuleModel } from '../generated/prisma/models/Rule.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

type ListRulesResponse = {
    error?: Error;
    result?: PagedResult<RuleModel>;
};

export class ListRulesUseCase {
    constructor(private ruleRepository: RuleRepository) {}

    async execute(page = 1, limit = 20): Promise<ListRulesResponse> {
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) => this.ruleRepository.findAll(skip, take),
                () => this.ruleRepository.count(),
            ),
        };
    }
}
