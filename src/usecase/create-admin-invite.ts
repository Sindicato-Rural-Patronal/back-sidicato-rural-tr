import { randomBytes } from 'crypto';
import type { AdminInviteRepository } from '../ports/external/admin-invite-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { UserDataNotFoundError, RuleNotFoundError } from '../errors/not-found.js';
import { AdminAccountAlreadyExistsError } from '../errors/conflict.js';

const INVITE_TTL_DAYS = 7;

export class CreateAdminInviteUseCase {
    constructor(
        private readonly inviteRepo: AdminInviteRepository,
        private readonly userDataRepo: UserDataRepository,
        private readonly ruleRepo: RuleRepository,
        private readonly userAdminRepo: UserAdminRepository,
    ) {}

    async execute(
        userDataId: string,
        rulesId: string,
    ): Promise<{ error?: Error; token?: string; expiresAt?: Date }> {
        const user = await this.userDataRepo.findById(userDataId);
        if (!user) return { error: new UserDataNotFoundError() };
        const rule = await this.ruleRepo.findById(rulesId);
        if (!rule) return { error: new RuleNotFoundError() };
        // Se a pessoa já é admin ativo, não faz sentido convidar.
        const existing = await this.userAdminRepo.findByUserDataId(userDataId);
        if (existing) return { error: new AdminAccountAlreadyExistsError() };

        const token = randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
        await this.inviteRepo.create({ token,
userDataId,
rulesId,
expiresAt });
        return { token, expiresAt };
    }
}
