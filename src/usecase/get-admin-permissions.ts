import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';

export class GetAdminPermissionsUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(userId: string): Promise<string[] | null> {
        const admin = await this.userAdminRepository.findById(userId);
        if (!admin) return null;
        const rule = await this.ruleRepository.findById(admin.rulesId);
        return rule?.permitions ?? null;
    }
}
