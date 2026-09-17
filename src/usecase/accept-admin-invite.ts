import bcrypt from 'bcrypt';
import type { AdminInviteRepository } from '../ports/external/admin-invite-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { NotificationPublisher } from '../ports/external/notification-repository.js';
import { inviteAcceptedEvent, publishSafely } from '../lib/notification-events.js';
import { AdminInviteInvalidError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { UsernameAlreadyExistsError, AdminAccountAlreadyExistsError } from '../errors/conflict.js';

export class AcceptAdminInviteUseCase {
    constructor(
        private readonly inviteRepo: AdminInviteRepository,
        private readonly userAdminRepo: UserAdminRepository,
        private readonly userDataRepo: UserDataRepository,
        private readonly notifications: NotificationPublisher,
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

        // Consumo atômico (uso único): se outra requisição já consumiu, cai fora.
        const consumed = await this.inviteRepo.consume(inv.id);
        if (!consumed) return { error: new AdminInviteInvalidError() };

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
        await this.notifyAccepted(inv.userDataId);
        return {};
    }

    private async notifyAccepted(userDataId: string): Promise<void> {
        try {
            const person = await this.userDataRepo.findById(userDataId);
            await publishSafely(this.notifications, inviteAcceptedEvent({
                personName: person?.name ?? 'Um novo administrador',
                userDataId,
            }));
        } catch (e) {
            // Acesso já ativado: falha ao avisar não desfaz nada.
            console.error('[notifications] falha ao avisar convite aceito', e);
        }
    }
}
