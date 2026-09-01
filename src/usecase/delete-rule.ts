import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { RuleNotFoundError } from '../errors/not-found.js';
import { RuleInUseError } from '../errors/conflict.js';

export class DeleteRuleUseCase {
    constructor(
        private readonly ruleRepository: RuleRepository,
        private readonly userAdminRepository: UserAdminRepository,
    ) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const rule = await this.ruleRepository.findById(id);
        if (!rule) return { error: new RuleNotFoundError() };
        // Trava: não apagar regra vinculada a administradores ativos.
        const inUse = await this.userAdminRepository.count({ rulesId: id });
        if (inUse > 0) return { error: new RuleInUseError() };
        await this.ruleRepository.delete(id);
        return {};
    }
}
