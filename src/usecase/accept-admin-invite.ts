import bcrypt from 'bcrypt';
import type { AdminInviteRepository } from '../ports/external/admin-invite-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { AdminInviteInvalidError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { UsernameAlreadyExistsError, AdminAccountAlreadyExistsError } from '../errors/conflict.js';

export class AcceptAdminInviteUseCase {
    constructor(
        private readonly inviteRepo: AdminInviteRepository,
        private readonly userAdminRepo: UserAdminRepository,
    ) {}

    async execute(token: string, username: string, password: string): Promise<{ error?: Error }> {
        const inv = await this.inviteRepo.findByToken(token);
        if (!inv || inv.usedAt || inv.expiresAt.getTime() < Date.now()) {
            return { error: new AdminInviteInvalidError() };
        }
        const uname = (username ?? '').trim();
        if (uname.length < 3) return { error: new ValidationError('Usuário deve ter ao menos 3 caracteres.') };
        if (!password || password.length < 8) {
            return { error: new ValidationError('Senha deve ter ao menos 8 caracteres.') };
        }
        // Username é unique no banco INCLUINDO soft-deletados. Se um admin ativo
        // (de outra pessoa) já usa esse nome → conflito real. Se só um admin
        // APAGADO segura o nome, liberamos renomeando a linha antiga.
        const holder = await this.userAdminRepo.findByUsernameAny(uname);
        if (holder && holder.userDataId !== inv.userDataId) {
            if (!holder.isDeleted) return { error: new UsernameAlreadyExistsError() };
            await this.userAdminRepo.update(holder.id, {
                username: `${holder.username}__del_${holder.id.slice(0, 8)}`,
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const existing = await this.userAdminRepo.findByUserDataIdAny(inv.userDataId);
        if (existing && !existing.isDeleted) return { error: new AdminAccountAlreadyExistsError() };

        if (existing) {
            await this.userAdminRepo.reactivate(existing.id, {
                username: uname,
                passwordHash,
                rulesId: inv.rulesId,
            });
        } else {
            await this.userAdminRepo.create({
                username: uname,
                passwordHash,
                userDataId: inv.userDataId,
                rulesId: inv.rulesId,
            });
        }
        await this.inviteRepo.markUsed(inv.id);
        return {};
    }
}
