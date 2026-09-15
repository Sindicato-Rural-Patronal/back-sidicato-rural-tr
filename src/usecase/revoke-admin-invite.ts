import type { AdminInviteRepository } from '../ports/external/admin-invite-repository.js';
import { NotFoundError } from '../errors/not-found.js';

export class RevokeAdminInviteUseCase {
    constructor(private readonly inviteRepo: AdminInviteRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.inviteRepo.deleteById(id);
        if (!ok) return { error: new NotFoundError('Convite não encontrado.') };
        return {};
    }
}
