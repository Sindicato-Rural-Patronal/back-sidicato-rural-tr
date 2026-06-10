import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { AdminNotFoundError, PermissionRuleNotFoundError } from '../errors/not-found.js';

export type CurrentAdminResponse = {
    error?: Error;
    data?: {
        userId: string;
        username: string;
        rulesId: string;
        ruleName: string;
        permitions: string[];
    };
};

export class GetCurrentAdminUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(userId: string): Promise<CurrentAdminResponse> {
        const admin = await this.userAdminRepository.findById(userId);
        if (!admin) return { error: new AdminNotFoundError() };

        const rule = await this.ruleRepository.findById(admin.rulesId);
        if (!rule) return { error: new PermissionRuleNotFoundError() };

        return {
            data: {
                userId: admin.id,
                username: admin.username,
                rulesId: admin.rulesId,
                ruleName: rule.name,
                permitions: rule.permitions,
            },
        };
    }
}
