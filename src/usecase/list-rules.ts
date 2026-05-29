import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleModel } from '../generated/prisma/models/Rule.js';
import { verifyPermission } from '../lib/verify-permission.js';

type ListRulesResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    rules?: RuleModel[];
};

export class ListRulesUseCase {
    constructor(
        private ruleRepository: RuleRepository,
        private userAdminRepository: UserAdminRepository
    ) {}

    async execute(token: string): Promise<ListRulesResponse> {
        const auth = await verifyPermission(token, 'READ_RULE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        const rules = await this.ruleRepository.findAll();
        return { success: true, rules };
    }
}
