import type { AdminInviteRepository } from '../ports/external/admin-invite-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';

export type PendingInvite = {
    id: string;
    userName: string;
    ruleName: string;
    expiresAt: Date;
    createdAt: Date;
    expired: boolean;
};

export class ListAdminInvitesUseCase {
    constructor(
        private readonly inviteRepo: AdminInviteRepository,
        private readonly userDataRepo: UserDataRepository,
        private readonly ruleRepo: RuleRepository,
    ) {}

    // Nunca expõe o token — só metadados; a revogação é por id.
    async execute(): Promise<PendingInvite[]> {
        const invites = await this.inviteRepo.listPending();
        const now = Date.now();
        const out: PendingInvite[] = [];
        for (const inv of invites) {
            const [user, rule] = await Promise.all([
                this.userDataRepo.findById(inv.userDataId),
                this.ruleRepo.findById(inv.rulesId),
            ]);
            out.push({
                id: inv.id,
                userName: user?.name ?? '—',
                ruleName: rule?.name ?? '—',
                expiresAt: inv.expiresAt,
                createdAt: inv.createdAt,
                expired: inv.expiresAt.getTime() < now,
            });
        }
        return out;
    }
}
