import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { AdminNotFoundError, PermissionRuleNotFoundError } from '../errors/not-found.js';

export type CurrentAdminResponse = {
    error?: Error;
    data?: {
        userId: string;
        userDataId: string;
        username: string;
        rulesId: string;
        ruleName: string;
        permissions: string[];
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
                userDataId: admin.userDataId,
                username: admin.username,
                rulesId: admin.rulesId,
                ruleName: rule.name,
                permissions: rule.permissions,
            },
        };
    }
}
