import type { AdminInviteRepository } from '../ports/external/admin-invite-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { AdminInviteInvalidError } from '../errors/not-found.js';

export class GetAdminInviteUseCase {
    constructor(
        private readonly inviteRepo: AdminInviteRepository,
        private readonly userDataRepo: UserDataRepository,
        private readonly ruleRepo: RuleRepository,
    ) {}

    async execute(
        token: string,
    ): Promise<{ error?: Error; invite?: { userName: string; ruleName: string } }> {
        const inv = await this.inviteRepo.findByToken(token);
        if (!inv || inv.usedAt || inv.expiresAt.getTime() < Date.now()) {
            return { error: new AdminInviteInvalidError() };
        }
        const user = await this.userDataRepo.findById(inv.userDataId);
        const rule = await this.ruleRepo.findById(inv.rulesId);
        return { invite: { userName: user?.name ?? '—',
ruleName: rule?.name ?? '—' } };
    }
}
