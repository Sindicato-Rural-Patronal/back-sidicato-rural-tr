import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { AdminNotFoundError, PermissionRuleNotFoundError } from '../errors/not-found.js';

export type CurrentAdminResponse = {
    error?: Error;
    data?: {
        userId: string;
        userDataId: string;
        username: string;
        name: string;
        avatar: string | null;
        rulesId: string;
        ruleName: string;
        permissions: string[];
        /** Preferências do Painel Geral deste admin; null = padrão. */
        dashboardPrefs: Record<string, unknown> | null;
    };
};

export class GetCurrentAdminUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
        private readonly userDataRepository: UserDataRepository,
    ) {}

    async execute(userId: string): Promise<CurrentAdminResponse> {
        const admin = await this.userAdminRepository.findById(userId);
        if (!admin) return { error: new AdminNotFoundError() };

        const rule = await this.ruleRepository.findById(admin.rulesId);
        if (!rule) return { error: new PermissionRuleNotFoundError() };

        const userData = await this.userDataRepository.findById(admin.userDataId);

        return {
            data: {
                userId: admin.id,
                userDataId: admin.userDataId,
                username: admin.username,
                name: userData?.name ?? admin.username,
                avatar: userData?.avatar ?? null,
                rulesId: admin.rulesId,
                ruleName: rule.name,
                permissions: rule.permissions,
                dashboardPrefs: (admin.dashboardPrefs as Record<string, unknown> | null) ?? null,
            },
        };
    }
}
