import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleModel } from '../generated/prisma/models/Rule.js';
import { verifyPermission } from '../lib/verify-permission.js';

type PagedResult<T> = { data: T[]; total: number; page: number; limit: number; totalPages: number };
type ListRulesResponse = { success: boolean; statusCode?: number; error?: Error; result?: PagedResult<RuleModel> };

export class ListRulesUseCase {
    constructor(
        private ruleRepository: RuleRepository,
        private userAdminRepository: UserAdminRepository
    ) {}

    async execute(token: string, page = 1, limit = 20): Promise<ListRulesResponse> {
        const auth = await verifyPermission(token, 'READ_RULE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[ListRules] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }
        const skip = (page - 1) * limit;
        const [rules, total] = await Promise.all([
            this.ruleRepository.findAll(skip, limit),
            this.ruleRepository.count(),
        ]);
        console.log(`[ListRules] page=${page} limit=${limit} total=${total}`);
        return { success: true, result: { data: rules, total, page, limit, totalPages: Math.ceil(total / limit) } };
    }
}
