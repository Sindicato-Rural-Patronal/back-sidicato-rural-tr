import type { AdminInviteModel } from '../../generated/prisma/models/AdminInvite.js';

export type { AdminInviteModel };

export interface AdminInviteRepository {
    create(data: {
        token: string;
        userDataId: string;
        rulesId: string;
        expiresAt: Date;
    }): Promise<AdminInviteModel>;
    findByToken(token: string): Promise<AdminInviteModel | null>;
    markUsed(id: string): Promise<void>;
    /** Consome o convite de forma atômica (usedAt: null → agora). true se conseguiu. */
    consume(id: string): Promise<boolean>;
    /** Convites ainda não usados, mais recentes primeiro. */
    listPending(): Promise<AdminInviteModel[]>;
    /** Remove um convite. true se existia. */
    deleteById(id: string): Promise<boolean>;
}
